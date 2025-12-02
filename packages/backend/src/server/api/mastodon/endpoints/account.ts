/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { parseTimelineArgs, TimelineArgs, toBoolean } from '@/server/api/mastodon/argsUtils.js';
import { MastodonClientService } from '@/server/api/mastodon/MastodonClientService.js';
import { DriveService } from '@/core/DriveService.js';
import { DI } from '@/di-symbols.js';
import type { AccessTokensRepository, UserProfilesRepository } from '@/models/_.js';
import { attachMinMaxPagination } from '@/server/api/mastodon/pagination.js';
import { MastodonConverters, convertRelationship, convertFeaturedTag, convertList } from '../MastodonConverters.js';
import type { FastifyInstance } from 'fastify';
import { promiseMap } from '@/misc/promise-map.js';

interface ApiAccountMastodonRoute {
	Params: { id?: string },
	Querystring: TimelineArgs & { acct?: string },
	Body: { notifications?: boolean }
}

@Injectable()
export class ApiAccountMastodon {
	constructor(
		@Inject(DI.userProfilesRepository)
		private readonly userProfilesRepository: UserProfilesRepository,

		@Inject(DI.accessTokensRepository)
		private readonly accessTokensRepository: AccessTokensRepository,

		private readonly clientService: MastodonClientService,
		private readonly mastoConverters: MastodonConverters,
		private readonly driveService: DriveService,
	) {}

	public register(fastify: FastifyInstance): void {
		fastify.get<ApiAccountMastodonRoute>('/v1/accounts/verify_credentials', async (_request, reply) => {
			const client = this.clientService.getClient(_request);
			const data = await client.verifyAccountCredentials();
			const acct = await this.mastoConverters.convertAccount(data.data);
			const response = Object.assign({}, acct, {
				source: {
					note: acct.note,
					fields: acct.fields,
					privacy: 'public',
					sensitive: false,
					language: '',
				},
			});
			return reply.send(response);
		});

		fastify.patch<{
			Body: {
				discoverable?: string,
				bot?: string,
				display_name?: string,
				note?: string,
				avatar?: string,
				header?: string,
				locked?: string,
				source?: {
					privacy?: string,
					sensitive?: string,
					language?: string,
				},
				fields_attributes?: {
					name: string,
					value: string,
				}[],
			},
		}>('/v1/accounts/update_credentials', async (_request, reply) => {
			const accessTokens = _request.headers.authorization;
			const client = this.clientService.getClient(_request);
			// Check if there is a Header or Avatar being uploaded, if there is proceed to upload it to the drive of the user and then set it.
			if (_request.savedRequestFiles?.length && accessTokens) {
				const tokeninfo = await this.accessTokensRepository.findOneBy({ token: accessTokens.replace('Bearer ', '') });
				const avatar = _request.savedRequestFiles.find(obj => {
					return obj.fieldname === 'avatar';
				});
				const header = _request.savedRequestFiles.find(obj => {
					return obj.fieldname === 'header';
				});

				if (tokeninfo && avatar) {
					const upload = await this.driveService.addFile({
						user: { id: tokeninfo.userId, host: null },
						path: avatar.filepath,
						name: avatar.filename && avatar.filename !== 'file' ? avatar.filename : undefined,
						sensitive: false,
					});
					if (upload.type.startsWith('image/')) {
						_request.body.avatar = upload.id;
					}
				} else if (tokeninfo && header) {
					const upload = await this.driveService.addFile({
						user: { id: tokeninfo.userId, host: null },
						path: header.filepath,
						name: header.filename && header.filename !== 'file' ? header.filename : undefined,
						sensitive: false,
					});
					if (upload.type.startsWith('image/')) {
						_request.body.header = upload.id;
					}
				}
			}

			if (_request.body.fields_attributes) {
				for (const field of _request.body.fields_attributes) {
					if (!(field.name.trim() === '' && field.value.trim() === '')) {
						if (field.name.trim() === '') return reply.code(400).send('Field name can not be empty');
						if (field.value.trim() === '') return reply.code(400).send('Field value can not be empty');
					}
				}
				_request.body.fields_attributes = _request.body.fields_attributes.filter(field => field.name.trim().length > 0 && field.value.length > 0);
			}

			const options = {
				..._request.body,
				discoverable: toBoolean(_request.body.discoverable),
				bot: toBoolean(_request.body.bot),
				locked: toBoolean(_request.body.locked),
				source: _request.body.source ? {
					..._request.body.source,
					sensitive: toBoolean(_request.body.source.sensitive),
				} : undefined,
			};
			const data = await client.updateCredentials(options);
			const response = await this.mastoConverters.convertAccount(data.data);

			return reply.send(response);
		});

		fastify.get<{ Querystring: { acct?: string } }>('/v1/accounts/lookup', async (_request, reply) => {
			if (!_request.query.acct) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required property "acct"' });

			const client = this.clientService.getClient(_request);
			const data = await client.search(_request.query.acct, { type: 'accounts' });
			const profile = await this.userProfilesRepository.findOneBy({ userId: data.data.accounts[0].id });
			data.data.accounts[0].fields = profile?.fields.map(f => ({ ...f, verified_at: null })) ?? [];
			const response = await this.mastoConverters.convertAccount(data.data.accounts[0]);

			return reply.send(response);
		});

		fastify.get<ApiAccountMastodonRoute & { Querystring: { id?: string | string[] } }>('/v1/accounts/relationships', async (_request, reply) => {
			if (!_request.query.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required property "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getRelationships(_request.query.id);
			const response = data.data.map(relationship => convertRelationship(relationship));

			return reply.send(response);
		});

		fastify.get<{ Querystring: { q: string; limit?: string; offset?: string; resolve?: string; following?: string; } }>('/v1/accounts/search', async (request, reply) => {
			if (!request.query.q) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required property "q"' });

			const client = this.clientService.getClient(request);

			const limit = request.query.limit ? parseInt(request.query.limit) : 40;

			const options = {
				following: toBoolean(request.query.following),
				limit,
				resolve: toBoolean(request.query.resolve),
			};

			const data = await client.searchAccount(request.query.q, options);
			const response = await Promise.all(data.data.map(async (account) => await this.mastoConverters.convertAccount(account)));

			return reply.send(response);
		});

		fastify.get<{ Params: { id?: string } }>('/v1/accounts/:id', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getAccount(_request.params.id);
			const account = await this.mastoConverters.convertAccount(data.data);

			return reply.send(account);
		});

		fastify.get<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/statuses', async (request, reply) => {
			if (!request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const { client, me } = await this.clientService.getAuthClient(request);
			const args = parseTimelineArgs(request.query);
			const data = await client.getAccountStatuses(request.params.id, args);
			const response = await promiseMap(data.data, async status => await this.mastoConverters.convertStatus(status, me), { limit: 2 });

			attachMinMaxPagination(request, reply, response);
			return reply.send(response);
		});

		fastify.get<{ Params: { id?: string } }>('/v1/accounts/:id/featured_tags', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getFeaturedTags();
			const response = data.data.map((tag) => convertFeaturedTag(tag));

			return reply.send(response);
		});

		fastify.get<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/followers', async (request, reply) => {
			if (!request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(request);
			const data = await client.getAccountFollowers(
				request.params.id,
				parseTimelineArgs(request.query),
			);
			const response = await promiseMap(data.data, async account => await this.mastoConverters.convertAccount(account), { limit: 2 });

			attachMinMaxPagination(request, reply, response);
			return reply.send(response);
		});

		fastify.get<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/following', async (request, reply) => {
			if (!request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(request);
			const data = await client.getAccountFollowing(
				request.params.id,
				parseTimelineArgs(request.query),
			);
			const response = await promiseMap(data.data, async account => await this.mastoConverters.convertAccount(account), { limit: 2 });

			attachMinMaxPagination(request, reply, response);
			return reply.send(response);
		});

		fastify.get<{ Params: { id?: string } }>('/v1/accounts/:id/lists', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getAccountLists(_request.params.id);
			const response = data.data.map((list) => convertList(list));

			return reply.send(response);
		});

		fastify.post<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/follow', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.followAccount(_request.params.id);
			const acct = convertRelationship(data.data);
			acct.following = true; // TODO this is wrong, follow may not have processed immediately

			return reply.send(acct);
		});

		fastify.post<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/unfollow', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.unfollowAccount(_request.params.id);
			const acct = convertRelationship(data.data);
			acct.following = false;

			return reply.send(acct);
		});

		fastify.post<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/block', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.blockAccount(_request.params.id);
			const response = convertRelationship(data.data);

			return reply.send(response);
		});

		fastify.post<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/unblock', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.unblockAccount(_request.params.id);
			const response = convertRelationship(data.data);

			return reply.send(response);
		});

		fastify.post<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/mute', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.muteAccount(
				_request.params.id,
				_request.body.notifications ?? true,
			);
			const response = convertRelationship(data.data);

			return reply.send(response);
		});

		fastify.post<ApiAccountMastodonRoute & { Params: { id?: string } }>('/v1/accounts/:id/unmute', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.unmuteAccount(_request.params.id);
			const response = convertRelationship(data.data);

			return reply.send(response);
		});
	}
}
