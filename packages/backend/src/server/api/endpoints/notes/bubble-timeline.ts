/*
 * SPDX-FileCopyrightText: Marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { UserService } from '@/core/UserService.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { ApiError } from '../../error.js';
import { Brackets } from 'typeorm';

export const meta = {
	tags: ['notes'],

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
		btlDisabled: {
			message: 'Bubble timeline has been disabled.',
			code: 'BTL_DISABLED',
			id: '0332fc13-6ab2-4427-ae80-a9fadffd1a6c',
		},

		bothWithRepliesAndWithFiles: {
			message: 'Specifying both withReplies and withFiles is not supported',
			code: 'BOTH_WITH_REPLIES_AND_WITH_FILES',
			id: 'dfaa3eb7-8002-4cb7-bcc4-1095df46656f',
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
		withFiles: { type: 'boolean', default: false },
		withBots: { type: 'boolean', default: true },
		withRenotes: { type: 'boolean', default: true },
		withReplies: { type: 'boolean', default: true },
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

		private noteEntityService: NoteEntityService,
		private queryService: QueryService,
		private roleService: RoleService,
		private utilityService: UtilityService,
		private readonly userService: UserService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const policies = await this.roleService.getUserPolicies(me);
			if (!policies.btlAvailable) {
				throw new ApiError(meta.errors.btlDisabled);
			}

			if (me) {
				this.userService.markUserActive(me);
			}

			//#region Construct query
			const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'),
				ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
				.andWhere('note.visibility = \'public\'')
				.andWhere('note.channelId IS NULL')
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.leftJoinAndSelect('renote.user', 'renoteUser')
				.limit(ps.limit);

			// This subquery mess teaches postgres how to use the right indexes.
			// Using WHERE or ON conditions causes a fallback to full sequence scan, which times out.
			// Important: don't use a query builder here or TypeORM will get confused and stop quoting column names! (known, unfixed bug apparently)
			query
				.leftJoin('(select "host" from "instance" where "isBubbled" = true)', 'bubbleInstance', '"bubbleInstance"."host" = "note"."userHost"');

			if (this.utilityService.isBubbledHost(null)) {
				query.andWhere(new Brackets(qb => qb
					.orWhere('"bubbleInstance" IS NOT NULL')
					.orWhere('"note"."userHost" IS NULL')));
			} else {
				query.andWhere('"bubbleInstance" IS NOT NULL');
			}
			this.queryService
				.leftJoin(query, 'note.userInstance', 'userInstance');

			this.queryService.generateExcludedRepliesQueryForNotes(query, me);
			this.queryService.generateBlockedHostQueryForNote(query);
			this.queryService.generateSuspendedUserQueryForNote(query);
			this.queryService.generateSilencedUserQueryForNotes(query, me);
			if (me) {
				this.queryService.generateMutedUserQueryForNotes(query, me);
				this.queryService.generateBlockedUserQueryForNotes(query, me);
				this.queryService.generateMutedNoteThreadQuery(query, me);
			}

			if (ps.withFiles) {
				query.andWhere('note.fileIds != \'{}\'');
			}

			if (!ps.withBots) query.andWhere('user.isBot = FALSE');

			if (!ps.withRenotes) {
				this.queryService.generateExcludedRenotesQueryForNotes(query);
			} else if (me) {
				this.queryService.generateMutedUserRenotesQueryForNotes(query, me);
			}

			// if (!ps.withReplies) {
			// 	if (me) {
			// 		const followees = await this.userFollowingService.getFollowees(me.id);
			// 		const shouldShowReplyUserIds = [me.id, ...followees.filter(x => x.withReplies).map(x => x.followeeId)];
			// 		query.andWhere(new Brackets(qb => {
			// 			qb
			// 				.where('note.replyId IS NULL') // 返信ではない
			// 				.orWhere('note.replyUserId = :meId', { meId: me.id }) // reply my note
			// 				.orWhere(new Brackets(qb => {
			// 					qb // 返信だけど投稿者自身への返信
			// 						.where('note.replyId IS NOT NULL')
			// 						.andWhere('note.replyUserId = note.userId');
			// 				}))
			// 				.orWhere('note.userId IN (:...shouldShowReplyUserIds)', {
			// 					shouldShowReplyUserIds,
			// 				});
			// 		}));
			// 	} else {
			// 		query.andWhere(new Brackets(qb => {
			// 			qb
			// 				.where('note.replyId IS NULL') // 返信ではない
			// 				.orWhere(new Brackets(qb => {
			// 					qb // 返信だけど投稿者自身への返信
			// 						.where('note.replyId IS NOT NULL')
			// 						.andWhere('note.replyUserId = note.userId');
			// 				}));
			// 		}));
			// 	}
			// }

			//#endregion

			const timeline = await query.getMany();
			return await this.noteEntityService.packMany(timeline, me);
		});
	}
}
