/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { toBoolean } from '@/server/api/mastodon/argsUtils.js';
import { MastodonClientService } from '@/server/api/mastodon/MastodonClientService.js';
import { convertFilter } from '../MastodonConverters.js';
import type { FastifyInstance } from 'fastify';

interface ApiFilterMastodonRoute {
	Params: {
		id?: string,
	},
	Body: {
		phrase?: string,
		context?: string[],
		irreversible?: string,
		whole_word?: string,
		expires_in?: string,
	}
}

@Injectable()
export class ApiFilterMastodon {
	constructor(
		private readonly clientService: MastodonClientService,
	) {}

	public register(fastify: FastifyInstance): void {
		fastify.get('/v1/filters', async (_request, reply) => {
			const client = this.clientService.getClient(_request);

			const data = await client.getFilters();
			const response = data.data.map((filter) => convertFilter(filter));

			return reply.send(response);
		});

		fastify.get<ApiFilterMastodonRoute & { Params: { id?: string } }>('/v1/filters/:id', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getFilter(_request.params.id);
			const response = convertFilter(data.data);

			return reply.send(response);
		});

		fastify.post<ApiFilterMastodonRoute>('/v1/filters', async (_request, reply) => {
			if (!_request.body.phrase) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required payload "phrase"' });
			if (!_request.body.context) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required payload "context"' });

			const options = {
				phrase: _request.body.phrase,
				context: _request.body.context,
				irreversible: toBoolean(_request.body.irreversible),
				whole_word: toBoolean(_request.body.whole_word),
				expires_in: _request.body.expires_in,
			};

			const client = this.clientService.getClient(_request);
			const data = await client.createFilter(_request.body.phrase, _request.body.context, options);
			const response = convertFilter(data.data);

			return reply.send(response);
		});

		fastify.post<ApiFilterMastodonRoute & { Params: { id?: string } }>('/v1/filters/:id', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });
			if (!_request.body.phrase) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required payload "phrase"' });
			if (!_request.body.context) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required payload "context"' });

			const options = {
				phrase: _request.body.phrase,
				context: _request.body.context,
				irreversible: toBoolean(_request.body.irreversible),
				whole_word: toBoolean(_request.body.whole_word),
				expires_in: _request.body.expires_in,
			};

			const client = this.clientService.getClient(_request);
			const data = await client.updateFilter(_request.params.id, _request.body.phrase, _request.body.context, options);
			const response = convertFilter(data.data);

			return reply.send(response);
		});

		fastify.delete<ApiFilterMastodonRoute & { Params: { id?: string } }>('/v1/filters/:id', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.deleteFilter(_request.params.id);

			return reply.send(data.data);
		});
	}
}
