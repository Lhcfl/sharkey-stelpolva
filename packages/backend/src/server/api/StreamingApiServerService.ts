/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import * as Redis from 'ioredis';
import * as WebSocket from 'ws';
import proxyAddr from 'proxy-addr';
import { DI } from '@/di-symbols.js';
import type { NoteReactionsRepository, NotesRepository, NoteFavoritesRepository, MiUser } from '@/models/_.js';
import type { Config } from '@/config.js';
import type { Result } from '@/types.js';
import type Logger from '@/logger.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { getIpHash } from '@/misc/get-ip-hash.js';
import { bindThis } from '@/decorators.js';
import { NotificationService } from '@/core/NotificationService.js';
import { CacheService } from '@/core/CacheService.js';
import { UserService } from '@/core/UserService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { SkRateLimiterService } from '@/server/SkRateLimiterService.js';
import { QueryService } from '@/core/QueryService.js';
import { TimeService, type TimerHandle } from '@/global/TimeService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { NoteVisibilityService } from '@/core/NoteVisibilityService.js';
import { IdentifiableError, errorCodes } from '@/misc/identifiable-error.js';
import { WebSocketUser } from '@/server/api/stream/WebSocketUser.js';
import { AuthenticateService, AuthenticationError } from './AuthenticateService.js';
import {
	Connection,
	ConnectionBacklogLimit,
	CloseTimeout,
	SocketConnectRateLimit,
	MaxConnectionsPerClient,
	type ConnectionEvents,
	type WebSocketClient,
	type WebSocketClosure,
} from './stream/Connection.js';
import { ChannelsService } from './stream/ChannelsService.js';
import type * as http from 'node:http';
import type stream from 'node:stream';

interface ClientState {
	/** All active connections from this client */
	connections: Set<Connection>;

	/** Client user, if authenticated */
	wsUser: WebSocketUser | null;

	/** User ID if authenticated, IP hash if unauthenticated */
	uid: string;
}

@Injectable()
export class StreamingApiServerService implements BeforeApplicationShutdown {
	private cleanConnectionsTimer: TimerHandle | null = null;
	private isAttached = false;

	/**
	 * Per-client data tracking.
	 * Key: User ID if authenticated, IP hash if unauthenticated.
	 * Value: ClientState w/ connection set and shared WebSocketUser.
	 */
	private readonly clients = new Map<string, ClientState>();
	private readonly logger: Logger;
	private readonly wss: WebSocket.WebSocketServer;

	constructor(
		@Inject(DI.redisForSub)
		private readonly redisForSub: Redis.Redis,

		@Inject(DI.notesRepository)
		private readonly notesRepository: NotesRepository,

		@Inject(DI.noteReactionsRepository)
		private readonly noteReactionsRepository: NoteReactionsRepository,

		@Inject(DI.noteFavoritesRepository)
		private readonly noteFavoritesRepository: NoteFavoritesRepository,

		@Inject(DI.config)
		private readonly config: Config,

		private readonly cacheService: CacheService,
		private readonly authenticateService: AuthenticateService,
		private readonly channelsService: ChannelsService,
		private readonly notificationService: NotificationService,
		private readonly usersService: UserService,
		private readonly noteVisibilityService: NoteVisibilityService,
		private readonly skRateLimiterService: SkRateLimiterService,
		private readonly loggerService: LoggerService,
		private readonly queryService: QueryService,
		private readonly timeService: TimeService,
		private readonly utilityService: UtilityService,
		private readonly internalEventService: InternalEventService,
	) {
		this.logger = loggerService.getLogger('streaming', 'coral');

		// Create WebSocket Server according to the "client authentication" example:
		// https://github.com/websockets/ws?tab=readme-ov-file#client-authentication
		this.wss = new WebSocket.WebSocketServer({
			noServer: true,
			perMessageDeflate: this.config.websocketCompression,
			backlog: ConnectionBacklogLimit,
			// @ts-expect-error type definitions have not been updated for version 8.19.0.
			closeTimeout: CloseTimeout,
		});

		// ws library will kill the process if we don't catch unhandled exceptions.
		// https://github.com/websockets/ws/issues/1354#issuecomment-1343117738
		this.wss.on('error', this.onWsError);
	}

	@bindThis
	public attach(server: http.Server): void {
		if (this.isAttached) {
			throw new IdentifiableError(errorCodes.assertionFailed, 'Attempting to connect StreamingApiServerService to multiple HTTP servers');
		}

		// Step 1: HTTPS server forwards "upgrade" messages here so we can handle them.
		// This callback is responsible for authenticating the client, but responses must be deferred until the connection is established.
		server.on('upgrade', this.onServerUpgrade);

		// Start a timer to monitor connection activity.
		// Since larger instances may have tens of thousands of connections, per-connection timers would bring unacceptable performance impact.
		// 一定期間通信が無いコネクションは実際には切断されている可能性があるため定期的にterminateする
		this.cleanConnectionsTimer = this.timeService.startTimer(this.cleanConnections, 1000 * 30, { repeated: true });

		// Mark as ready
		this.isAttached = true;
	}

	@bindThis
	private async onServerUpgrade(request: http.IncomingMessage, socket: stream.Duplex, head: Buffer): Promise<void> {
		const authResult = await this.authenticateServerUpgrade(request);

		// Step 2: pass Upgrade from HTTPS to WS.
		// This will either bail (applying dieInstantly) or pass forward the connected websocket.
		this.wss.handleUpgrade(request, socket, head, async (ws) => {
			// Special handler to hard-terminate the connection if it fails during initialization.
			const onWsInitError = (error: unknown) => {
				this.onWsError(error);
				ws.terminate();
			};

			socket.on('error', onWsInitError);
			ws.on('error', onWsInitError);
			try {
				if (authResult.result) {
					await this.onWsUpgrade(request, ws, authResult.result);
				} else {
					ws.close(authResult.error[0], authResult.error[1]);
				}
			} catch (err) {
				onWsInitError(err);
			} finally {
				ws.off('error', onWsInitError);
				socket.off('error', onWsInitError);
			}
		});
	}

	@bindThis
	private async authenticateServerUpgrade(request: http.IncomingMessage): Promise<Result<UpgradeAuthResult, WebSocketClosure>> {
		// ServerServices sets `trustProxy: true`, which inside fastify/request.js ends up calling `proxyAddr` in this way, so we do the same.
		const requestIp = proxyAddr(request, () => true);

		// Note: it's unclear if request.url can ever *actually* be null, but handle it anyway.
		const q = request.url
			? new URL(request.url, `https://${request.headers.host}`).searchParams
			: new URLSearchParams();

		// https://datatracker.ietf.org/doc/html/rfc6750.html#section-2.1
		// Note that the standard WHATWG WebSocket API does not support setting any headers,
		// but non-browser apps may still be able to set it.
		const authToken = request.headers.authorization?.startsWith('Bearer ')
			? request.headers.authorization.slice(7)
			: q.get('i');

		try {
			const [user, token] = await this.authenticateService.authenticate(authToken);

			// Check client user
			if (user && !this.utilityService.isActiveUser(user)) {
				return { error: { code: 4001, message: 'User suspended' } };
			}

			// Check client app
			if (token && !token.permission.some(p => p === 'read:account')) {
				return { error: { code: 4003, message: 'Your app does not have necessary permissions to use websocket API.' } };
			}

			// Check connection rate limit
			const limitActor = user?.id ?? getIpHash(requestIp);
			const limitResult = await this.skRateLimiterService.limit(SocketConnectRateLimit, limitActor);
			if (limitResult.blocked) {
				return { error: { code: 4029, message: 'Rate Limit Exceeded: connecting too fast' } };
			}

			// Check connection total limit
			const existingConnections = this.clients.get(limitActor)?.connections.size ?? 0;
			if (existingConnections >= MaxConnectionsPerClient) {
				return { error: { code: 1008, message: 'Connection Limit Exceeded' } };
			}

			// Get or create per-client data
			const state = this.getClientState(limitActor, user);

			const client: WebSocketClient = {
				// These are shared
				user: state.wsUser,
				uid: state.uid,
				// These are unique
				token: token,
				ip: requestIp,
			};

			return { result: { client, state } };
		} catch (e) {
			if (e instanceof AuthenticationError) {
				return { error: { code: 4000, message: 'Failed to authenticate' } };
			} else {
				this.logger.error(`Error while authenticating WebSocket client: ${renderInlineError(e)}`);
				return { error: { code: 1001, message: 'Internal server error' } };
			}
		}
	}

	@bindThis
	private getClientState(uid: string, user: MiUser | null) {
		let state = this.clients.get(uid);
		if (state == null) {
			state = {
				connections: new Set(),
				wsUser: user ? new WebSocketUser(
					this.notesRepository,
					this.noteReactionsRepository,
					this.noteFavoritesRepository,
					this.queryService,
					this.cacheService,
					this.timeService,
					this.utilityService,
					this.internalEventService,
					user,
				) : null,
				uid,
			};
			this.clients.set(uid, state);
		}
		return state;
	}

	@bindThis
	private async onWsUpgrade(request: http.IncomingMessage, ws: WebSocket.WebSocket, result: UpgradeAuthResult): Promise<void> {
		const wsClient = result.client;
		const wsState = result.state;

		// Create connection wrapper here, since initialization is async and node event emitters don't support that.
		const connection = new Connection(
			// Service instances
			this.redisForSub,
			this.channelsService,
			this.notificationService,
			this.cacheService,
			this.notesRepository,
			this.noteVisibilityService,
			this.timeService,
			this.skRateLimiterService,
			this.loggerService,

			// Client info
			wsClient, ws,
		);

		// Track connection to avoid memory leaks.
		wsState.connections.add(connection);

		// Track heartbeats
		const onHeartbeat = ({ lastActive }: ConnectionEvents['heartbeat']) => {
			if (connection.user) {
				this.usersService.markUserActive(connection.user, 'idle', lastActive);
			}
		};
		connection.on('heartbeat', onHeartbeat);
		connection.once('open', () => {
			if (connection.user) {
				this.usersService.markUserActive(connection.user, 'read');
			}
		});

		// Cleanup and error-handling
		connection.on('error', this.onWsError);
		connection.once('close', () => {
			connection.off('error', this.onWsError);
			connection.off('heartbeat', onHeartbeat);
			wsState.connections.delete(connection);
		});

		// Initialize the connection here, where we can safely handle errors.
		await connection.open();

		// Success! open() didn't throw, so the connection is now live.
		// Step 3: pass the initialized connection back into WS (not clear if this is necessary, but the docs have it).
		this.wss.emit('connection', ws, request, { connection });
	}

	@bindThis
	private async cleanConnections(): Promise<void> {
		const promises: Promise<void>[] = [];

		const now = this.timeService.now;
		for (const client of this.clients.values().toArray()) {
			// If there are no active connections for this client, then remove state to free up memory.
			if (client.connections.size < 1) {
				this.clients.delete(client.uid);
				continue;
			}

			// Otherwise check all the connections.
			for (const connection of client.connections) {
				const timeSinceLastActive = now - connection.lastActiveAt;
				if (timeSinceLastActive > 1000 * 60 * 2) {
					// Close connections after 2+ minutes without contact.
					promises.push(connection.close(1000, 'Connection timed out'));
				} else if (timeSinceLastActive > 1000 * 20) {
					// Ping clients after 20+ seconds without contact.
					promises.push(connection.pingWs());
				}
			}
		}

		// Wait for parallel tasks to complete
		if (promises.length > 0) {
			// Ignore errors because we already have the "error" event
			await Promise.allSettled(promises);
		}
	}

	@bindThis
	public async detach(): Promise<void> {
		if (!this.isAttached) return;

		// Stop cleanup timer
		this.timeService.stopTimer(this.cleanConnectionsTimer);
		this.cleanConnectionsTimer = null;

		// Close all connections.
		// Ignore errors since we're shutting down anyway.
		await Promise.allSettled(this.clients.values().flatMap(c => c.connections).map(async connection => {
			await connection.dispose();
		}));
		this.clients.clear();

		// Mark as disposed
		this.isAttached = false;
	}

	@bindThis
	public async beforeApplicationShutdown(): Promise<void> {
		await this.detach();

		// Close server *only* in actual shutdown, since it's irreversible.
		await new Promise<void>(resolve => {
			this.wss.close(() => resolve());
		});

		// Don't disconnect this until server is fully closed.
		this.wss.off('error', this.onWsError);
	}

	@bindThis
	private onWsError(error: unknown) {
		this.logger.error(`Unhandled error in streaming api: ${renderInlineError(error)}`);
		this.logger.debug('Error details:', { error });
	}
}

interface UpgradeAuthResult {
	client: WebSocketClient;
	state: ClientState;
}
