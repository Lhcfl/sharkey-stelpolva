/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { MastodonClientService } from '@/server/api/mastodon/MastodonClientService.js';
import { attachMinMaxPagination, attachOffsetPagination } from '@/server/api/mastodon/pagination.js';
import { MastodonConverters } from '../MastodonConverters.js';
import { parseTimelineArgs, TimelineArgs, toBoolean, toInt } from '../argsUtils.js';
import { ApiError } from '../../error.js';
import type { FastifyInstance } from 'fastify';
import type { Entity } from 'megalodon';

interface ApiSearchMastodonRoute {
	Querystring: TimelineArgs & {
		type?: string;
		q?: string;
		resolve?: string;
	}
}

@Injectable()
export class ApiSearchMastodon {
	constructor(
		private readonly mastoConverters: MastodonConverters,
		private readonly clientService: MastodonClientService,
	) {}

	public register(fastify: FastifyInstance): void {
		fastify.get<ApiSearchMastodonRoute>('/v1/search', async (request, reply) => {
			if (!request.query.q) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required property "q"' });
			if (!request.query.type) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required property "type"' });

			const type = request.query.type;
			if (type !== 'hashtags' && type !== 'statuses' && type !== 'accounts') {
				return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Invalid type' });
			}

			const { client, me } = await this.clientService.getAuthClient(request);

			if (toBoolean(request.query.resolve) && !me) {
				return reply.code(401).send({ error: 'The access token is invalid', error_description: 'Authentication is required to use the "resolve" property' });
			}
			if (toInt(request.query.offset) && !me) {
				return reply.code(401).send({ error: 'The access token is invalid', error_description: 'Authentication is required to use the "offset" property' });
			}

			// TODO implement resolve

			const query = parseTimelineArgs(request.query);
			const { data } = await client.search(request.query.q, { type, ...query });
			const response = {
				...data,
				accounts: await Promise.all(data.accounts.map((account: Entity.Account) => this.mastoConverters.convertAccount(account))),
				statuses: await Promise.all(data.statuses.map((status: Entity.Status) => this.mastoConverters.convertStatus(status, me))),
			};

			if (type === 'hashtags') {
				attachOffsetPagination(request, reply, response.hashtags);
			} else {
				attachMinMaxPagination(request, reply, response[type]);
			}

			return reply.send(response);
		});

		fastify.get<ApiSearchMastodonRoute>('/v2/search', async (request, reply) => {
			if (!request.query.q) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required property "q"' });

			const type = request.query.type;
			if (type !== undefined && type !== 'hashtags' && type !== 'statuses' && type !== 'accounts') {
				return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Invalid type' });
			}

			const { client, me } = await this.clientService.getAuthClient(request);

			if (toBoolean(request.query.resolve) && !me) {
				return reply.code(401).send({ error: 'The access token is invalid', error_description: 'Authentication is required to use the "resolve" property' });
			}
			if (toInt(request.query.offset) && !me) {
				return reply.code(401).send({ error: 'The access token is invalid', error_description: 'Authentication is required to use the "offset" property' });
			}

			// TODO implement resolve

			const query = parseTimelineArgs(request.query);
			const acct = !type || type === 'accounts' ? await client.search(request.query.q, { type: 'accounts', ...query }) : null;
			const stat = !type || type === 'statuses' ? await client.search(request.query.q, { type: 'statuses', ...query }) : null;
			const tags = !type || type === 'hashtags' ? await client.search(request.query.q, { type: 'hashtags', ...query }) : null;
			const response = {
				accounts: await Promise.all(acct?.data.accounts.map((account: Entity.Account) => this.mastoConverters.convertAccount(account)) ?? []),
				statuses: await Promise.all(stat?.data.statuses.map((status: Entity.Status) => this.mastoConverters.convertStatus(status, me)) ?? []),
				hashtags: tags?.data.hashtags ?? [],
			};

			// Pagination hack, based on "best guess" expected behavior.
			// Mastodon doesn't document this part at all!
			const longestResult = [response.statuses, response.hashtags]
				.reduce((longest: unknown[], current: unknown[]) => current.length > longest.length ? current : longest, response.accounts);

			// Ignore min/max pagination because how TF would that work with multiple result sets??
			// Offset pagination is the only possible option
			attachOffsetPagination(request, reply, longestResult);

			return reply.send(response);
		});

		fastify.get<ApiSearchMastodonRoute>('/v1/trends/statuses', async (request, reply) => {
			const baseUrl = this.clientService.getBaseUrl(request);
			const res = await fetch(`${baseUrl}/api/notes/featured`,
				{
					method: 'POST',
					headers: {
						...request.headers,
						'Accept': 'application/json',
						'Content-Type': 'application/json',
					},
					body: '{}',
				});

			await verifyResponse(res);

			const data = await res.json() as Entity.Status[];
			const me = await this.clientService.getAuth(request);
			const response = await Promise.all(data.map(status => this.mastoConverters.convertStatus(status, me)));

			attachMinMaxPagination(request, reply, response);
			return reply.send(response);
		});

		fastify.get<ApiSearchMastodonRoute>('/v2/suggestions', async (request, reply) => {
			const baseUrl = this.clientService.getBaseUrl(request);
			const res = await fetch(`${baseUrl}/api/users`,
				{
					method: 'POST',
					headers: {
						...request.headers,
						'Accept': 'application/json',
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						limit: parseTimelineArgs(request.query).limit ?? 20,
						origin: 'local',
						sort: '+follower',
						state: 'alive',
					}),
				});

			await verifyResponse(res);

			const data = await res.json() as Entity.Account[];
			const response = await Promise.all(data.map(async entry => {
				return {
					source: 'global',
					account: await this.mastoConverters.convertAccount(entry),
				};
			}));

			attachOffsetPagination(request, reply, response);
			return reply.send(response);
		});
	}
}

async function verifyResponse(res: Response): Promise<void> {
	if (res.ok) return;

	const text = await res.text();

	if (res.headers.get('content-type') === 'application/json') {
		try {
			const json = JSON.parse(text);

			if (json && typeof(json) === 'object') {
				json.httpStatusCode = res.status;
				return json;
			}
		} catch { /* ignore */ }
	}

	// Response is not a JSON object; treat as string
	throw new ApiError({
		code: 'INTERNAL_ERROR',
		message: text || 'Internal error occurred. Please contact us if the error persists.',
		id: '5d37dbcb-891e-41ca-a3d6-e690c97775ac',
		kind: 'server',
		httpStatusCode: res.status,
	});
}
