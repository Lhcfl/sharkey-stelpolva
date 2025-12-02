/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import querystring, { ParsedUrlQueryInput } from 'querystring';
import { Injectable } from '@nestjs/common';
import { emojiRegexAtStartToEnd } from '@/misc/emoji-regex.js';
import { parseTimelineArgs, TimelineArgs, toBoolean, toInt } from '@/server/api/mastodon/argsUtils.js';
import { MastodonClientService } from '@/server/api/mastodon/MastodonClientService.js';
import { MastodonDataService } from '@/server/api/mastodon/MastodonDataService.js';
import { getNoteSummary } from '@/misc/get-note-summary.js';
import { isPureRenote } from '@/misc/is-renote.js';
import { promiseMap } from '@/misc/promise-map.js';
import { convertAttachment, convertPoll, MastodonConverters } from '../MastodonConverters.js';
import type { Entity } from 'megalodon';
import type { FastifyInstance } from 'fastify';

function normalizeQuery(data: Record<string, unknown>) {
	const str = querystring.stringify(data as ParsedUrlQueryInput);
	return querystring.parse(str);
}

@Injectable()
export class ApiStatusMastodon {
	constructor(
		private readonly mastoConverters: MastodonConverters,
		private readonly clientService: MastodonClientService,
		private readonly mastodonDataService: MastodonDataService,
	) {}

	public register(fastify: FastifyInstance): void {
		fastify.get<{ Params: { id?: string } }>('/v1/statuses/:id', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const note = await this.mastodonDataService.requireNote(_request.params.id, me, { user: true, renote: { user: true } });

			// Unpack renote for Discord, otherwise the preview breaks
			const appearNote = (isPureRenote(note) && _request.headers['user-agent']?.match(/\bDiscordbot\//))
				? note.renote as NonNullable<typeof note.renote>
				: note;

			const data = await client.getStatus(appearNote.id);
			const response = await this.mastoConverters.convertStatus(data.data, me, { note: appearNote, user: appearNote.user });

			// Fixup - Discord ignores CWs and renders the entire post.
			if (response.sensitive && _request.headers['user-agent']?.match(/\bDiscordbot\//)) {
				// TODO move this mastoConverters?
				response.content = getNoteSummary({
					...data.data,
					user: {
						...data.data.account,
						emojis: {},
						noindex: data.data.account.noindex ?? false,
					},
					visibility: data.data.visibility === 'direct'
						? 'specified'
						: data.data.visibility === 'private'
							? 'followers'
							: data.data.visibility === 'unlisted'
								? 'home'
								: data.data.visibility,
					mentions: data.data.mentions.map(m => m.id),
					tags: data.data.tags.map(t => t.name),
					poll: data.data.poll && {
						...data.data.poll,
						choices: data.data.poll.options.map(o => ({
							...o,
							text: o.title,
							votes: o.votes_count ?? 0,
							isVoted: o.votes_count != null,
						})),
					},
					emojis: {},
				});
				response.media_attachments = [];
				response.in_reply_to_id = null;
				response.in_reply_to_account_id = null;
				response.reblog = null;
				response.quote = null;
			}

			return reply.send(response);
		});

		fastify.get<{ Params: { id?: string } }>('/v1/statuses/:id/source', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getStatusSource(_request.params.id);

			return reply.send(data.data);
		});

		fastify.get<{ Params: { id?: string }, Querystring: TimelineArgs }>('/v1/statuses/:id/context', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const { data } = await client.getStatusContext(_request.params.id, parseTimelineArgs(_request.query));
			const ancestors = await promiseMap(data.ancestors, async (status: Entity.Status) => await this.mastoConverters.convertStatus(status, me), { limit: 4 });
			const descendants = await promiseMap(data.descendants, async (status: Entity.Status) => await this.mastoConverters.convertStatus(status, me), { limit: 4 });
			const response = { ancestors, descendants };

			return reply.send(response);
		});

		fastify.get<{ Params: { id?: string } }>('/v1/statuses/:id/history', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const user = await this.clientService.getAuth(_request);
			const edits = await this.mastoConverters.getEdits(_request.params.id, user);

			return reply.send(edits);
		});

		fastify.get<{ Params: { id?: string } }>('/v1/statuses/:id/reblogged_by', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getStatusRebloggedBy(_request.params.id);
			const response = await promiseMap(data.data, async (account: Entity.Account) => await this.mastoConverters.convertAccount(account), { limit: 4 });

			return reply.send(response);
		});

		fastify.get<{ Params: { id?: string } }>('/v1/statuses/:id/favourited_by', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getStatusFavouritedBy(_request.params.id);
			const response = await promiseMap(data.data, async (account: Entity.Account) => await this.mastoConverters.convertAccount(account), { limit: 4 });

			return reply.send(response);
		});

		fastify.get<{ Params: { id?: string } }>('/v1/media/:id', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getMedia(_request.params.id);
			const response = convertAttachment(data.data);

			return reply.send(response);
		});

		fastify.get<{ Params: { id?: string } }>('/v1/polls/:id', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.getPoll(_request.params.id);
			const response = convertPoll(data.data);

			return reply.send(response);
		});

		fastify.post<{ Params: { id?: string }, Body: { choices?: number[] } }>('/v1/polls/:id/votes', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });
			if (!_request.body.choices) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required payload "choices"' });

			const client = this.clientService.getClient(_request);
			const data = await client.votePoll(_request.params.id, _request.body.choices);
			const response = convertPoll(data.data);

			return reply.send(response);
		});

		fastify.post<{
			Body: {
				media_ids?: string[],
				poll?: {
					options?: string[],
					expires_in?: string,
					multiple?: string,
					hide_totals?: string,
				},
				in_reply_to_id?: string,
				sensitive?: string,
				spoiler_text?: string,
				visibility?: 'public' | 'unlisted' | 'private' | 'direct',
				scheduled_at?: string,
				language?: string,
				quote_id?: string,
				status?: string,

				// Broken clients
				'poll[options][]'?: string[],
				'media_ids[]'?: string[],
			}
		}>('/v1/statuses', async (_request, reply) => {
			let body = _request.body;
			if ((!body.poll && body['poll[options][]']) || (!body.media_ids && body['media_ids[]'])
			) {
				body = normalizeQuery(body);
			}
			const text = body.status ??= ' ';
			const removed = text.replace(/@\S+/g, '').replace(/\s|/g, '');
			const isDefaultEmoji = emojiRegexAtStartToEnd.test(removed);
			const isCustomEmoji = /^:[a-zA-Z0-9@_]+:$/.test(removed);

			const { client, me } = await this.clientService.getAuthClient(_request);
			if ((body.in_reply_to_id && isDefaultEmoji) || (body.in_reply_to_id && isCustomEmoji)) {
				const a = await client.createEmojiReaction(
					body.in_reply_to_id,
					removed,
				);
				return reply.send(a.data);
			}
			if (body.in_reply_to_id && removed === '/unreact') {
				const id = body.in_reply_to_id;
				const post = await client.getStatus(id);
				const react = post.data.emoji_reactions.filter((e: Entity.Reaction) => e.me)[0].name;
				const data = await client.deleteEmojiReaction(id, react);
				return reply.send(data.data);
			}
			body.media_ids ??= undefined;
			if (body.media_ids && !body.media_ids.length) body.media_ids = undefined;

			if (body.poll && !body.poll.options) {
				return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required payload "poll.options"' });
			}
			if (body.poll && !body.poll.expires_in) {
				return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required payload "poll.expires_in"' });
			}

			const options = {
				...body,
				sensitive: toBoolean(body.sensitive),
				poll: body.poll ? {
					options: body.poll.options!, // eslint-disable-line @typescript-eslint/no-non-null-assertion
					expires_in: toInt(body.poll.expires_in)!, // eslint-disable-line @typescript-eslint/no-non-null-assertion
					multiple: toBoolean(body.poll.multiple),
					hide_totals: toBoolean(body.poll.hide_totals),
				} : undefined,
			};

			const data = await client.postStatus(text, options);
			const response = await this.mastoConverters.convertStatus(data.data as Entity.Status, me);

			return reply.send(response);
		});

		fastify.put<{
			Params: { id: string },
			Body: {
				status?: string,
				spoiler_text?: string,
				sensitive?: string,
				media_ids?: string[],
				poll?: {
					options?: string[],
					expires_in?: string,
					multiple?: string,
					hide_totals?: string,
				},
			}
		}>('/v1/statuses/:id', async (_request, reply) => {
			const { client, me } = await this.clientService.getAuthClient(_request);
			const body = _request.body;

			if (!body.media_ids || !body.media_ids.length) {
				body.media_ids = undefined;
			}

			const options = {
				...body,
				sensitive: toBoolean(body.sensitive),
				poll: body.poll ? {
					options: body.poll.options,
					expires_in: toInt(body.poll.expires_in),
					multiple: toBoolean(body.poll.multiple),
					hide_totals: toBoolean(body.poll.hide_totals),
				} : undefined,
			};

			const data = await client.editStatus(_request.params.id, options);
			const response = await this.mastoConverters.convertStatus(data.data, me);

			return reply.send(response);
		});

		fastify.post<{ Params: { id?: string } }>('/v1/statuses/:id/favourite', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const data = await client.createEmojiReaction(_request.params.id, '❤');
			const response = await this.mastoConverters.convertStatus(data.data, me);

			return reply.send(response);
		});

		fastify.post<{ Params: { id?: string } }>('/v1/statuses/:id/unfavourite', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const data = await client.deleteEmojiReaction(_request.params.id, '❤');
			const response = await this.mastoConverters.convertStatus(data.data, me);

			return reply.send(response);
		});

		fastify.post<{ Params: { id?: string } }>('/v1/statuses/:id/reblog', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const data = await client.reblogStatus(_request.params.id);
			const response = await this.mastoConverters.convertStatus(data.data, me);

			return reply.send(response);
		});

		fastify.post<{ Params: { id?: string } }>('/v1/statuses/:id/unreblog', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const data = await client.unreblogStatus(_request.params.id);
			const response = await this.mastoConverters.convertStatus(data.data, me);

			return reply.send(response);
		});

		fastify.post<{ Params: { id?: string } }>('/v1/statuses/:id/bookmark', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const data = await client.bookmarkStatus(_request.params.id);
			const response = await this.mastoConverters.convertStatus(data.data, me);

			return reply.send(response);
		});

		fastify.post<{ Params: { id?: string } }>('/v1/statuses/:id/unbookmark', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const data = await client.unbookmarkStatus(_request.params.id);
			const response = await this.mastoConverters.convertStatus(data.data, me);

			return reply.send(response);
		});
		fastify.post<{ Params: { id?: string } }>('/v1/statuses/:id/pin', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const data = await client.pinStatus(_request.params.id);
			const response = await this.mastoConverters.convertStatus(data.data, me);

			return reply.send(response);
		});

		fastify.post<{ Params: { id?: string } }>('/v1/statuses/:id/unpin', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const data = await client.unpinStatus(_request.params.id);
			const response = await this.mastoConverters.convertStatus(data.data, me);

			return reply.send(response);
		});

		fastify.post<{ Params: { id?: string, name?: string } }>('/v1/statuses/:id/react/:name', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });
			if (!_request.params.name) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "name"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const data = await client.createEmojiReaction(_request.params.id, _request.params.name);
			const response = await this.mastoConverters.convertStatus(data.data, me);

			return reply.send(response);
		});

		fastify.post<{ Params: { id?: string, name?: string } }>('/v1/statuses/:id/unreact/:name', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });
			if (!_request.params.name) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "name"' });

			const { client, me } = await this.clientService.getAuthClient(_request);
			const data = await client.deleteEmojiReaction(_request.params.id, _request.params.name);
			const response = await this.mastoConverters.convertStatus(data.data, me);

			return reply.send(response);
		});

		fastify.delete<{ Params: { id?: string } }>('/v1/statuses/:id', async (_request, reply) => {
			if (!_request.params.id) return reply.code(400).send({ error: 'BAD_REQUEST', error_description: 'Missing required parameter "id"' });

			const client = this.clientService.getClient(_request);
			const data = await client.deleteStatus(_request.params.id);

			return reply.send(data.data);
		});
	}
}
