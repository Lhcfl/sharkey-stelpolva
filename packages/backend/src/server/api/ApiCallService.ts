/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as stream from 'node:stream/promises';
import { Inject, Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { DI } from '@/di-symbols.js';
import { getIpHash } from '@/misc/get-ip-hash.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type Logger from '@/logger.js';
import type { MiMeta, UserIpsRepository } from '@/models/_.js';
import { createTemp } from '@/misc/create-temp.js';
import { bindThis } from '@/decorators.js';
import { RoleService } from '@/core/RoleService.js';
import type { Config } from '@/config.js';
import { sendRateLimitHeaders } from '@/misc/rate-limit-utils.js';
import { SkRateLimiterService } from '@/server/SkRateLimiterService.js';
import { TimeService, type TimerHandle } from '@/global/TimeService.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { renderFullError } from '@/misc/render-full-error.js';
import { ApiError } from './error.js';
import { ApiLoggerService } from './ApiLoggerService.js';
import { AuthenticateService, AuthenticationError } from './AuthenticateService.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { OnApplicationShutdown } from '@nestjs/common';
import type { IEndpointMeta, IEndpoint } from './endpoints.js';

const accessDenied = {
	message: 'Access denied.',
	code: 'ACCESS_DENIED',
	id: '56f35758-7dd5-468b-8439-5d6fb8ec9b8e',
};

@Injectable()
export class ApiCallService implements OnApplicationShutdown {
	private logger: Logger;
	private userIpHistories: Map<MiUser['id'], Set<string>>;
	private userIpHistoriesClearIntervalId: TimerHandle;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.config)
		private config: Config,

		@Inject(DI.userIpsRepository)
		private userIpsRepository: UserIpsRepository,

		private authenticateService: AuthenticateService,
		private rateLimiterService: SkRateLimiterService,
		private roleService: RoleService,
		private apiLoggerService: ApiLoggerService,
		private readonly timeService: TimeService,
	) {
		this.logger = this.apiLoggerService.logger;
		this.userIpHistories = new Map<MiUser['id'], Set<string>>();

		this.userIpHistoriesClearIntervalId = this.timeService.startTimer(() => {
			this.userIpHistories.clear();
		}, 1000 * 60 * 60, { repeated: true });
	}

	#sendApiError(reply: FastifyReply, err: ApiError): void {
		let statusCode = err.httpStatusCode;
		if (err.httpStatusCode === 401) {
			reply.header('WWW-Authenticate', 'Bearer realm="Misskey"');
		} else if (err.kind === 'client') {
			reply.header('WWW-Authenticate', `Bearer realm="Misskey", error="invalid_request", error_description="${err.message}"`);
			statusCode = statusCode ?? 400;
		} else if (err.kind === 'permission') {
			// (ROLE_PERMISSION_DENIEDは関係ない)
			if (err.code === 'PERMISSION_DENIED') {
				reply.header('WWW-Authenticate', `Bearer realm="Misskey", error="insufficient_scope", error_description="${err.message}"`);
			}
			statusCode = statusCode ?? 403;
		} else if (!statusCode) {
			statusCode = 500;
		}
		this.send(reply, statusCode, err);
	}

	#sendAuthenticationError(reply: FastifyReply, err: unknown): void {
		if (err instanceof AuthenticationError) {
			const message = 'Authentication failed. Please ensure your token is correct.';
			reply.header('WWW-Authenticate', `Bearer realm="Misskey", error="invalid_token", error_description="${message}"`);
			this.send(reply, 401, new ApiError({
				message: 'Authentication failed. Please ensure your token is correct.',
				code: 'AUTHENTICATION_FAILED',
				id: 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14',
			}));
		} else {
			this.send(reply, 500, new ApiError());
		}
	}

	#onExecError(ep: IEndpoint, data: any, err: Error, userId?: MiUser['id']): void {
		if (err instanceof ApiError || err instanceof AuthenticationError) {
			throw err;
		} else {
			const errId = randomUUID();
			const fullError = renderFullError(err);
			const message = typeof(fullError) === 'string'
				? `Internal error id=${errId} occurred in ${ep.name}: ${fullError}`
				: `Internal error id=${errId} occurred in ${ep.name}:`;
			const data = typeof(fullError) === 'object'
				? { e: fullError }
				: {};
			this.logger.error(message, {
				user: userId ?? '<unauthenticated>',
				...data,
			});

			if (this.config.sentryForBackend) {
				Sentry.captureMessage(`Internal error occurred in ${ep.name}: ${renderInlineError(err)}`, {
					level: 'error',
					user: {
						id: userId,
					},
					extra: {
						ep: ep.name,
						e: {
							message: err.message,
							code: err.name,
							stack: err.stack,
							id: errId,
						},
					},
				});
			}

			throw new ApiError(null, {
				e: {
					message: err.message,
					code: err.name,
					id: errId,
				},
			});
		}
	}

	@bindThis
	public async handleRequest(
		endpoint: IEndpoint & { exec: any },
		request: FastifyRequest<{ Body: Record<string, unknown> | undefined, Querystring: Record<string, unknown> }>,
		reply: FastifyReply,
	): Promise<void> {
		// Tell crawlers not to index API endpoints.
		// https://developers.google.com/search/docs/crawling-indexing/block-indexing
		reply.header('X-Robots-Tag', 'noindex');

		const body = request.method === 'GET'
			? request.query
			: request.body;

		// https://datatracker.ietf.org/doc/html/rfc6750.html#section-2.1 (case sensitive)
		const token = request.headers.authorization?.startsWith('Bearer ')
			? request.headers.authorization.slice(7)
			: body?.['i'];
		if (token != null && typeof token !== 'string') {
			reply.code(400);
			return;
		}
		await this.authenticateService.authenticate(token).then(async ([user, app]) => {
			await this.call(endpoint, user, app, body, null, request, reply).then((res) => {
				if (request.method === 'GET' && endpoint.meta.cacheSec && !token && !user) {
					reply.header('Cache-Control', `public, max-age=${endpoint.meta.cacheSec}`);
				}
				this.send(reply, res);
			}).catch((err: ApiError) => {
				this.#sendApiError(reply, err);
			});

			if (user) {
				// logIp records errors directly
				this.logIp(request, user).catch(() => null);
			}
		}).catch(err => {
			this.#sendAuthenticationError(reply, err);
		});
	}

	@bindThis
	public async handleMultipartRequest(
		endpoint: IEndpoint & { exec: any },
		request: FastifyRequest<{ Body: Record<string, unknown>, Querystring: Record<string, unknown> }>,
		reply: FastifyReply,
	): Promise<void> {
		const multipartData = await request.file().catch(() => {
			/* Fastify throws if the remote didn't send multipart data. Return 400 below. */
		});
		if (multipartData == null) {
			reply.code(400);
			reply.send();
			return;
		}

		const [path, cleanup] = await createTemp();
		await stream.pipeline(multipartData.file, fs.createWriteStream(path));

		// ファイルサイズが制限を超えていた場合
		// なお truncated はストリームを読み切ってからでないと機能しないため、stream.pipeline より後にある必要がある
		if (multipartData.file.truncated) {
			cleanup();
			reply.code(413);
			reply.send();
			return;
		}

		const fields = {} as Record<string, unknown>;
		for (const [k, v] of Object.entries(multipartData.fields)) {
			fields[k] = typeof v === 'object' && 'value' in v ? v.value : undefined;
		}

		// https://datatracker.ietf.org/doc/html/rfc6750.html#section-2.1 (case sensitive)
		const token = request.headers.authorization?.startsWith('Bearer ')
			? request.headers.authorization.slice(7)
			: fields['i'];
		if (token != null && typeof token !== 'string') {
			cleanup();
			reply.code(400);
			return;
		}
		await this.authenticateService.authenticate(token).then(async ([user, app]) => {
			await this.call(endpoint, user, app, fields, {
				name: multipartData.filename,
				path: path,
			}, request, reply).then((res) => {
				this.send(reply, res);
			}).catch((err: ApiError) => {
				cleanup();
				this.#sendApiError(reply, err);
			});

			if (user) {
				// logIp records errors directly
				this.logIp(request, user).catch(() => null);
			}
		}).catch(err => {
			cleanup();
			this.#sendAuthenticationError(reply, err);
		});
	}

	@bindThis
	private send(reply: FastifyReply, x?: any, y?: ApiError) {
		if (x == null) {
			reply.code(204);
			reply.send();
		} else if (typeof x === 'number' && y) {
			reply.code(x);
			reply.send({
				error: {
					message: y!.message,
					code: y!.code,
					id: y!.id,
					kind: y!.kind,
					...(y!.info ? { info: y!.info } : {}),
				},
			});
		} else {
			// 文字列を返す場合は、JSON.stringify通さないとJSONと認識されない
			reply.send(typeof x === 'string' ? JSON.stringify(x) : x);
		}
	}

	@bindThis
	private async logIp(request: FastifyRequest, user: MiLocalUser) {
		if (!this.meta.enableIpLogging) return;
		const ip = request.ip;
		if (!ip) {
			this.logger.warn(`user ${user.id} has a null IP address; please check your network configuration.`);
			return;
		}

		const ips = this.userIpHistories.get(user.id);
		if (ips == null || !ips.has(ip)) {
			if (ips == null) {
				this.userIpHistories.set(user.id, new Set([ip]));
			} else {
				ips.add(ip);
			}

			try {
				await this.userIpsRepository.createQueryBuilder().insert().values({
					createdAt: this.timeService.date,
					userId: user.id,
					ip: ip,
				}).orIgnore(true).execute();
			} catch (err) {
				this.logger.warn(`Failed to save IP address ${ip} for user ${user.id}: ${renderInlineError(err)}`);
			}
		}
	}

	@bindThis
	private async call(
		ep: IEndpoint & { exec: any },
		user: MiLocalUser | null | undefined,
		token: MiAccessToken | null | undefined,
		data: any,
		file: {
			name: string;
			path: string;
		} | null,
		request: FastifyRequest<{ Body: Record<string, unknown> | undefined, Querystring: Record<string, unknown> }>,
		reply: FastifyReply,
	) {
		const isSecure = user != null && token == null;

		if (ep.meta.secure && !isSecure) {
			throw new ApiError(accessDenied);
		}

		// For endpoints without a limit, the default is 10 calls per second
		const endpointLimit = ep.meta.limit ?? {
			duration: 1000,
			max: 10,
		};

		// We don't need this check, but removing it would cause a big merge conflict.
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (endpointLimit) {
			// koa will automatically load the `X-Forwarded-For` header if `proxy: true` is configured in the app.
			let limitActor: string | MiLocalUser;
			if (user) {
				limitActor = user;
			} else {
				limitActor = getIpHash(request.ip);
			}

			const limit = {
				key: ep.name,
				...endpointLimit,
			};

			// Rate limit
			const info = await this.rateLimiterService.limit(limit, limitActor);

			sendRateLimitHeaders(reply, info);

			if (info.blocked) {
				throw new ApiError({
					message: 'Rate limit exceeded. Please try again later.',
					code: 'RATE_LIMIT_EXCEEDED',
					id: 'd5826d14-3982-4d2e-8011-b9e9f02499ef',
					httpStatusCode: 429,
				}, info);
			}
		}

		if (ep.meta.requireCredential || ep.meta.requireModerator || ep.meta.requireAdmin) {
			if (user == null && ep.meta.requireCredential !== 'optional') {
				throw new ApiError({
					message: 'Credential required.',
					code: 'CREDENTIAL_REQUIRED',
					id: '1384574d-a912-4b81-8601-c7b1c4085df1',
					httpStatusCode: 401,
				});
			} else if (user?.isSuspended) {
				throw new ApiError({
					message: 'Your account has been suspended.',
					code: 'YOUR_ACCOUNT_SUSPENDED',
					kind: 'permission',
					id: 'a8c724b3-6e9c-4b46-b1a8-bc3ed6258370',
				});
			}
		}

		if (ep.meta.prohibitMoved) {
			if (user?.movedToUri) {
				throw new ApiError({
					message: 'You have moved your account.',
					code: 'YOUR_ACCOUNT_MOVED',
					kind: 'permission',
					id: '56f20ec9-fd06-4fa5-841b-edd6d7d4fa31',
				});
			}
		}

		if ((ep.meta.requireModerator || ep.meta.requireAdmin) && (this.meta.rootUserId !== user?.id)) {
			const myRoles = user ? await this.roleService.getUserRoles(user) : [];
			if (ep.meta.requireModerator && !myRoles.some(r => r.isModerator || r.isAdministrator)) {
				throw new ApiError({
					message: 'You are not assigned to a moderator role.',
					code: 'ROLE_PERMISSION_DENIED',
					kind: 'permission',
					id: 'd33d5333-db36-423d-a8f9-1a2b9549da41',
				});
			}
			if (ep.meta.requireAdmin && !myRoles.some(r => r.isAdministrator)) {
				throw new ApiError({
					message: 'You are not assigned to an administrator role.',
					code: 'ROLE_PERMISSION_DENIED',
					kind: 'permission',
					id: 'c3d38592-54c0-429d-be96-5636b0431a61',
				});
			}
		}

		if (ep.meta.requiredRolePolicy != null && (this.meta.rootUserId !== user?.id)) {
			const myRoles = user ? await this.roleService.getUserRoles(user) : [];
			const policies = await this.roleService.getUserPolicies(user ?? null);
			if (!policies[ep.meta.requiredRolePolicy] && !myRoles.some(r => r.isAdministrator)) {
				throw new ApiError({
					message: 'You are not assigned to a required role.',
					code: 'ROLE_PERMISSION_DENIED',
					kind: 'permission',
					id: '7f86f06f-7e15-4057-8561-f4b6d4ac755a',
				});
			}
		}

		if (token && ((ep.meta.kind && !token.permission.some(p => p === ep.meta.kind))
			|| (!ep.meta.kind && (ep.meta.requireCredential || ep.meta.requireModerator || ep.meta.requireAdmin)))) {
			throw new ApiError({
				message: 'Your app does not have the necessary permissions to use this endpoint.',
				code: 'PERMISSION_DENIED',
				kind: 'permission',
				id: '1370e5b7-d4eb-4566-bb1d-7748ee6a1838',
			});
		}

		// Cast non JSON input
		if ((ep.meta.requireFile || request.method === 'GET') && ep.params.properties) {
			for (const k of Object.keys(ep.params.properties)) {
				const param = ep.params.properties[k];
				if (['boolean', 'number', 'integer'].includes(param.type ?? '') && typeof data[k] === 'string') {
					try {
						data[k] = JSON.parse(data[k]);
					} catch (e) {
						throw new ApiError({
							message: 'Invalid param.',
							code: 'INVALID_PARAM',
							id: '0b5f1631-7c1a-41a6-b399-cce335f34d85',
						}, {
							param: k,
							reason: `cannot cast to ${param.type}`,
						});
					}
				}
			}
		}

		// API invoking
		if (this.config.sentryForBackend) {
			return await Sentry.startSpan({
				name: 'API: ' + ep.name,
			}, () => ep.exec(data, user, token, file, request.ip, request.headers)
				.catch((err: Error) => this.#onExecError(ep, data, err, user?.id)));
		} else {
			return await ep.exec(data, user, token, file, request.ip, request.headers)
				.catch((err: Error) => this.#onExecError(ep, data, err, user?.id));
		}
	}

	@bindThis
	public dispose(): void {
		this.timeService.stopTimer(this.userIpHistoriesClearIntervalId);
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
