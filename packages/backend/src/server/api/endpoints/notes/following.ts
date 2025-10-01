/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { SkLatestNote, MiFollowing } from '@/models/_.js';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { ApiError } from '@/server/api/error.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	kind: 'read:account',
	allowGet: true,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},

	errors: {
		bothWithRepliesAndWithFiles: {
			message: 'Specifying both includeReplies and filesOnly is not supported',
			code: 'BOTH_INCLUDE_REPLIES_AND_FILES_ONLY',
			id: '91c8cb9f-36ed-46e7-9ca2-7df96ed6e222',
		},
		bothWithFollowersAndIncludeNonPublic: {
			message: 'Specifying both list:followers and includeNonPublic is not supported',
			code: 'BOTH_LIST_FOLLOWERS_AND_INCLUDE_NON_PUBLIC',
			id: '7a1b9cb6-235b-4e58-9c00-32c1796f502c',
		},
	},

	// 10 calls per 5 seconds
	limit: {
		duration: 1000 * 5,
		max: 10,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		list: { type: 'string', enum: ['following', 'followers', 'mutuals'], default: 'following' },

		filesOnly: { type: 'boolean', default: false },
		includeNonPublic: { type: 'boolean', default: false },
		includeReplies: { type: 'boolean', default: false },
		includeQuotes: { type: 'boolean', default: false },
		includeBots: { type: 'boolean', default: true },

		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private readonly noteEntityService: NoteEntityService,
		private readonly queryService: QueryService,
		private readonly activeUsersChart: ActiveUsersChart,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.includeReplies && ps.filesOnly) throw new ApiError(meta.errors.bothWithRepliesAndWithFiles);
			if (ps.list === 'followers' && ps.includeNonPublic) throw new ApiError(meta.errors.bothWithFollowersAndIncludeNonPublic);

			const query = this.notesRepository
				.createQueryBuilder('note')
				.setParameters({ meId: me.id })

				// Limit to latest notes
				.innerJoin(
					(sub: SelectQueryBuilder<SkLatestNote>) => {
						sub
							.from(SkLatestNote, 'latest')

							// Return only one note per user
							.addSelect('latest.user_id', 'user_id')
							.addSelect('MAX(latest.note_id)', 'note_id')
							.groupBy('latest.user_id');

						// Match selected note types.
						if (!ps.includeNonPublic) {
							sub.andWhere('latest.is_public = true');
						}
						if (!ps.includeReplies) {
							sub.andWhere('latest.is_reply = false');
						}
						if (!ps.includeQuotes) {
							sub.andWhere('latest.is_quote = false');
						}

						// Select the appropriate collection of users
						if (ps.list === 'followers') {
							addFollower(sub);
						} else if (ps.list === 'following') {
							addFollowee(sub);
						} else {
							addMutual(sub);
						}

						return sub;
					},
					'latest',
					'note.id = latest.note_id',
				)

				// Avoid N+1 queries from the "pack" method
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.leftJoinAndSelect('renote.user', 'renoteUser')

				// Exclude channel notes
				.andWhere({ channelId: IsNull() })
			;

			// Limit to files, if requested
			if (ps.filesOnly) {
				query.andWhere('note."fileIds" != \'{}\'');
			}

			// Match selected user types.
			if (!ps.includeBots) {
				query.andWhere('"user"."isBot" = false');
			}

			// Hide blocked users / instances
			query.andWhere('"user"."isSuspended" = false');
			this.queryService.generateBlockedHostQueryForNote(query);
			this.queryService.generateSilencedUserQueryForNotes(query, me, ps.list !== 'followers');
			this.queryService.generateSuspendedUserQueryForNote(query);

			// Respect blocks, mutes, and privacy
			this.queryService.generateVisibilityQuery(query, me);
			this.queryService.generateBlockedUserQueryForNotes(query, me);
			this.queryService.generateMutedUserQueryForNotes(query, me, ps.list !== 'followers');

			// Support pagination
			this.queryService
				.makePaginationQuery(query, ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
				.take(ps.limit);

			// Query and return the next page
			const notes = await query.getMany();

			process.nextTick(() => {
				this.activeUsersChart.read(me);
			});

			return await this.noteEntityService.packMany(notes, me, { skipHide: true });
		});
	}
}

/**
 * Limit to followers (they follow us)
 */
function addFollower<T extends SelectQueryBuilder<ObjectLiteral>>(query: T): T {
	return query.innerJoin(MiFollowing, 'follower', 'follower."followerId" = latest.user_id AND follower."followeeId" = :meId');
}

/**
 * Limit to followees (we follow them)
 */
function addFollowee<T extends SelectQueryBuilder<ObjectLiteral>>(query: T): T {
	return query.innerJoin(MiFollowing, 'followee', 'followee."followerId" = :meId AND followee."followeeId" = latest.user_id');
}

/**
 * Limit to mutuals (they follow us AND we follow them)
 */
function addMutual<T extends SelectQueryBuilder<ObjectLiteral>>(query: T): T {
	addFollower(query);
	addFollowee(query);
	return query;
}
