/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'events';
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import * as Redis from 'ioredis';
import * as WebSocket from 'ws';
import proxyAddr from 'proxy-addr';
import { DI } from '@/di-symbols.js';
import type { UsersRepository, MiAccessToken, MiUser, NoteReactionsRepository, NotesRepository, NoteFavoritesRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import type { Keyed, RateLimit } from '@/misc/rate-limit-utils.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { NotificationService } from '@/core/NotificationService.js';
import { bindThis } from '@/decorators.js';
import { CacheService } from '@/core/CacheService.js';
import { MiLocalUser } from '@/models/User.js';
import { UserService } from '@/core/UserService.js';
import { ChannelFollowingService } from '@/core/ChannelFollowingService.js';
import { getIpHash } from '@/misc/get-ip-hash.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { SkRateLimiterService } from '@/server/SkRateLimiterService.js';
import { QueryService } from '@/core/QueryService.js';
import { TimeService, type TimerHandle } from '@/global/TimeService.js';
import { AuthenticateService, AuthenticationError } from './AuthenticateService.js';
import MainStreamConnection from './stream/Connection.js';
import { ChannelsService } from './stream/ChannelsService.js';
import type * as http from 'node:http';

// Maximum number of simultaneous connections by client (user ID or IP address).
// Excess connections will be closed automatically.
const MAX_CONNECTIONS_PER_CLIENT = 32;

@Injectable()
export class StreamingApiServerService implements OnApplicationShutdown {
	#wss?: WebSocket.WebSocketServer;
	#connections = new Map<WebSocket.WebSocket, number>();
	#connectionsByClient = new Map<string, Set<WebSocket.WebSocket>>(); // key: IP / user ID -> value: connection
	#cleanConnectionsIntervalId: TimerHandle | null = null;
	readonly #globalEv = new EventEmitter();
	#logger: Logger;

	constructor(
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.noteReactionsRepository)
		private readonly noteReactionsRepository: NoteReactionsRepository,

		@Inject(DI.notesRepository)
		private readonly notesRepository: NotesRepository,

		@Inject(DI.noteFavoritesRepository)
		private readonly noteFavoritesRepository: NoteFavoritesRepository,

		@Inject(DI.config)
		private config: Config,

		private cacheService: CacheService,
		private authenticateService: AuthenticateService,
		private channelsService: ChannelsService,
		private notificationService: NotificationService,
		private usersService: UserService,
		private channelFollowingService: ChannelFollowingService,
		private rateLimiterService: SkRateLimiterService,
		private loggerService: LoggerService,
		private readonly queryService: QueryService,
		private readonly timeService: TimeService,
	) {
		this.redisForSub.on('message', this.onRedis);
		this.#logger = loggerService.getLogger('streaming', 'coral');
	}

	@bindThis
	onApplicationShutdown() {
		this.redisForSub.off('message', this.onRedis);
		this.#globalEv.removeAllListeners();
		// Other shutdown logic is handled by detach(), which gets called by ServerServer's own shutdown handler.
	}

	@bindThis
	private async rateLimitThis(
		limitActor: MiUser | string,
		limit: Keyed<RateLimit>,
	) : Promise<boolean> {
		// Rate limit
		const rateLimit = await this.rateLimiterService.limit(limit, limitActor);
		return rateLimit.blocked;
	}

	@bindThis
	private onRedis(_: string, data: string) {
		const parsed = JSON.parse(data);
		this.#globalEv.emit('message', parsed);
	}

	@bindThis
	public attach(server: http.Server): void {
		const wss = this.#wss = new WebSocket.WebSocketServer({
			noServer: true,
			perMessageDeflate: this.config.websocketCompression,
		});

		// ws library will kill the process if we don't catch unhandled exceptions.
		// https://github.com/websockets/ws/issues/1354#issuecomment-1343117738
		this.#wss.on('error', this.onWsError);

		server.on('upgrade', async (request, socket, head) => {
			if (request.url == null) {
				socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
				socket.destroy();
				return;
			}

			const q = new URL(request.url, `http://${request.headers.host}`).searchParams;

			let user: MiLocalUser | null = null;
			let app: MiAccessToken | null = null;
			let dieInstantly: [number, string] | null = null;

			// https://datatracker.ietf.org/doc/html/rfc6750.html#section-2.1
			// Note that the standard WHATWG WebSocket API does not support setting any headers,
			// but non-browser apps may still be able to set it.
			const token = request.headers.authorization?.startsWith('Bearer ')
				? request.headers.authorization.slice(7)
				: q.get('i');

			try {
				[user, app] = await this.authenticateService.authenticate(token);

				if (app !== null && !app.permission.some(p => p === 'read:account')) {
					throw new AuthenticationError('Your app does not have necessary permissions to use websocket API.');
				}
			} catch (e) {
				if (e instanceof AuthenticationError) {
					dieInstantly = [4000, 'Failed to authenticate'];
				} else {
					socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
					socket.destroy();
					return;
				}
			}

			if (user?.isSuspended) {
				dieInstantly = [4001, 'User suspended'];
			}

			// ServerServices sets `trustProxy: true`, which inside fastify/request.js ends up calling `proxyAddr` in this way, so we do the same.
			const requestIp = proxyAddr(request, () => true );
			const limitActor = user?.id ?? getIpHash(requestIp);
			if (await this.rateLimitThis(limitActor, {
				// Up to 32 connections, then 1 every 10 seconds
				type: 'bucket',
				key: 'wsconnect',
				size: 32,
				dripRate: 10 * 1000,
			})) {
				socket.write('HTTP/1.1 429 Rate Limit Exceeded\r\n\r\n');
				socket.destroy();
				return;
			}

			// For performance and code simplicity, obtain and hold this reference for the lifetime of the connection.
			// This should be safe because the map entry should only be deleted after *all* connections close.
			let connectionsForClient = this.#connectionsByClient.get(limitActor);
			if (!connectionsForClient) {
				connectionsForClient = new Set();
				this.#connectionsByClient.set(limitActor, connectionsForClient);
			}

			// Close excess connections
			while (connectionsForClient.size >= MAX_CONNECTIONS_PER_CLIENT) {
				// Set maintains insertion order, so first entry is the oldest.
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const oldestConnection = connectionsForClient.values().next().value!;

				// Technically, the close() handler should remove this entry.
				// But if that ever fails, then we could enter an infinite loop.
				// We manually remove the connection here just in case.
				oldestConnection.close(1008, 'Disconnected - too many simultaneous connections');
				connectionsForClient.delete(oldestConnection);
			}

			const rateLimiter = () => {
				// Rather high limit because when catching up at the top of a timeline, the frontend may render many many notes.
				// Each of which causes a message via `useNoteCapture` to ask for realtime updates of that note.
				return this.rateLimitThis(limitActor, {
					type: 'bucket',
					key: 'wsmessage',
					size: 4096, // Allow spikes of up to 4096
					dripRate: 50, // Then once every 50ms (20/second rate)
				});
			};

			const stream = new MainStreamConnection(
				this.noteReactionsRepository,
				this.notesRepository,
				this.noteFavoritesRepository,
				this.queryService,
				this.channelsService,
				this.notificationService,
				this.cacheService,
				this.channelFollowingService,
				this.timeService,
				this.loggerService,
				user, app, requestIp,
				rateLimiter,
			);

			await stream.init();

			wss.handleUpgrade(request, socket, head, (ws) => {
				connectionsForClient.add(ws);

				// Call before emit() in case it throws an error.
				// We don't want to leave dangling references!
				ws.once('close', () => {
					connectionsForClient.delete(ws);

					// Make sure we don't leak the Set objects!
					if (connectionsForClient.size < 1) {
						this.#connectionsByClient.delete(limitActor);
					}

					stream.dispose();
				});

				if (dieInstantly !== null) {
					ws.close(...dieInstantly);
					return;
				}

				// Special handler to hard-terminate the connection if it fails during initialization.
				// Disconnect immediately after because the connection() handler below defines its own error handler.
				const onWsInitError = (error: unknown) => {
					this.onWsError(error);
					ws.terminate();
				};

				ws.on('error', onWsInitError);
				wss.emit('connection', ws, request, {
					stream, user, app,
				});
				ws.off('error', onWsInitError);
			});
		});

		this.#wss.on('connection', async (connection: WebSocket.WebSocket, request: http.IncomingMessage, ctx: {
			stream: MainStreamConnection,
			user: MiLocalUser | null;
			app: MiAccessToken | null
		}) => {
			const { stream, user, app } = ctx;

			const ev = new EventEmitter();

			function onRedisMessage(data: any): void {
				ev.emit(data.channel, data.message);
			}

			this.#globalEv.on('message', onRedisMessage);

			await stream.listen(ev, connection);

			this.#connections.set(connection, this.timeService.now);

			// TODO use collapsed queue
			const userUpdateIntervalId = user ? this.timeService.startTimer(async () => {
				await this.usersService.updateLastActiveDate(user);
			}, 1000 * 60 * 5, { repeated: true }) : null;
			if (user) {
				await this.usersService.updateLastActiveDate(user);
			}
			const pong = () => {
				this.#connections.set(connection, this.timeService.now);
			};

			connection.once('close', () => {
				connection.off('error', this.onWsError);
				connection.off('pong', pong);
				ev.removeAllListeners();
				stream.dispose();
				this.#globalEv.off('message', onRedisMessage);
				this.#connections.delete(connection);
				if (userUpdateIntervalId) this.timeService.stopTimer(userUpdateIntervalId);
			});

			connection.on('error', this.onWsError);
			connection.on('pong', pong);
		});

		// 一定期間通信が無いコネクションは実際には切断されている可能性があるため定期的にterminateする
		this.#cleanConnectionsIntervalId = this.timeService.startTimer(() => {
			const now = this.timeService.now;
			for (const [connection, lastActive] of this.#connections.entries()) {
				if (now - lastActive > 1000 * 60 * 2) {
					connection.terminate();
					this.#connections.delete(connection);
				} else {
					connection.ping();
				}
			}
		}, 1000 * 60, { repeated: true });
	}

	@bindThis
	public async detach(): Promise<void> {
		if (this.#cleanConnectionsIntervalId) {
			this.timeService.stopTimer(this.#cleanConnectionsIntervalId);
			this.#cleanConnectionsIntervalId = null;
		}

		for (const connection of this.#connections.keys()) {
			connection.close();
		}

		this.#connections.clear();
		this.#connectionsByClient.clear();

		await new Promise<void>((resolve, reject) => {
			if (this.#wss) {
				this.#wss.close(err => {
					// according to the documentation, this callback only receives an error if the server was already closed: we can ignore that
					resolve();
				});
			} else {
				resolve();
			}
		});

		// Don't disconnect this until *after* close returns
		this.#wss?.off('error', this.onWsError);
	}

	@bindThis
	private async onWsError(error: unknown) {
		this.#logger.error(`Unhandled error in streaming api: ${renderInlineError(error)}`);
		this.#logger.debug('Error details:', { error });
	}
}
