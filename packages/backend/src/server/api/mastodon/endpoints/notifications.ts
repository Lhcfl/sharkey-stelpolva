/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { MastodonEntity } from 'megalodon';
import { parseTimelineArgs, TimelineArgs } from '@/server/api/mastodon/argsUtils.js';
import { MastodonConverters } from '@/server/api/mastodon/MastodonConverters.js';
import { attachMinMaxPagination } from '@/server/api/mastodon/pagination.js';
import { MastodonClientService } from '../MastodonClientService.js';
import type { FastifyInstance } from 'fastify';
import { promiseMap } from '@/misc/promise-map.js';

interface ApiNotifyMastodonRoute {
	Params: {
		id?: string,
	},
	Querystring: TimelineArgs,
}

@Injectable()
export class ApiNotificationsMastodon {
	constructor(
		private readonly mastoConverters: MastodonConverters,
		private readonly clientService: MastodonClientService,
	) {}

	public register(fastify: FastifyInstance): void {
		fastify.get<ApiNotifyMastodonRoute>('/v1/notifications', async (request, reply) => {
			const { client, me } = await this.clientService.getAuthClient(request);
			const data = await client.getNotifications(parseTimelineArgs(request.query));
			const notifications = await promiseMap(data.data, async n => await this.mastoConverters.convertNotification(n, me), { limit: 4 });
			const response: MastodonEntity.Notification[] = [];
			for (const notification of notifications) {
				// Notifications for inaccessible notes will be null and should be ignored
				if (!notification) continue;

				response.push(notification);
				if (notification.type === 'reaction') {
					response.push({
						...notification,
						type: 'favourite',
					});
				}
			}

			attachMinMaxPagination(request, reply, response);
			return reply.send(response);
		});

		fastify.get<ApiNotifyMastodonRoute & { Params: { id?: string } }>('/v1/notification/:id', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const data = await client.getNotification(_request.params.id);
			const response = await this.mastoConverters.convertNotification(data.data, me);

			// Notifications for inaccessible notes will be null and should be ignored
			if (!response) {
				return reply.code(404).send({
					error: 'NOT_FOUND',
				});
			}

			return reply.send(response);
		});

		fastify.post<ApiNotifyMastodonRoute & { Params: { id?: string } }>('/v1/notification/:id/dismiss', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.dismissNotification(_request.params.id);

			return reply.send(data.data);
		});

		fastify.post<ApiNotifyMastodonRoute>('/v1/notifications/clear', async (_request, reply) => {
			const client = this.clientService.getClient(_request);
			const data = await client.dismissNotifications();

			return reply.send(data.data);
		});
	}
}
