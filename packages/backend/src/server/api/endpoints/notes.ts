/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { RoleService } from '@/core/RoleService.js';

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
		gtlDisabled: {
			message: 'Global timeline has been disabled.',
			code: 'GTL_DISABLED',
			id: '0332fc13-6ab2-4427-ae80-a9fadffd1a6b',
		},
		ltlDisabled: {
			message: 'Local timeline has been disabled.',
			code: 'LTL_DISABLED',
			id: '45a6eb02-7695-4393-b023-dd3be9aaaefd',
		},
	},

	// 120 calls per minute
	// 200 ms between calls
	limit: {
		duration: 1000 * 60,
		max: 120,
		minInterval: 200,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		local: { type: 'boolean', default: false },
		reply: { type: 'boolean' },
		renote: { type: 'boolean' },
		withFiles: { type: 'boolean' },
		poll: { type: 'boolean' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
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
		private readonly roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const policies = await this.roleService.getUserPolicies(me ? me.id : null);
			if (!ps.local && !policies.gtlAvailable) {
				throw new ApiError(meta.errors.gtlDisabled);
			}
			if (ps.local && !policies.ltlAvailable) {
				throw new ApiError(meta.errors.ltlDisabled);
			}

			const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), ps.sinceId, ps.untilId)
				.andWhere('note.visibility = \'public\'')
				.andWhere('note.localOnly = FALSE')
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.leftJoinAndSelect('renote.user', 'renoteUser')
				.limit(ps.limit);

			this.queryService.generateVisibilityQuery(query, me);
			if (me) {
				this.queryService.generateSilencedUserQueryForNotes(query, me);
				this.queryService.generateMutedUserQueryForNotes(query, me);
				this.queryService.generateBlockedUserQueryForNotes(query, me);
			}

			if (ps.local) {
				query.andWhere('note.userHost IS NULL');
			} else {
				this.queryService.generateBlockedHostQueryForNote(query);
			}

			if (ps.reply) {
				this.queryService.generateExcludedRepliesQueryForNotes(query, me);
			} else if (ps.reply === false) {
				query.andWhere('note.replyId IS NULL');
			}

			if (ps.renote !== undefined) {
				if (ps.renote) {
					this.queryService.andIsRenote(query, 'note');

					if (me) {
						this.queryService.generateMutedUserRenotesQueryForNotes(query, me);
					}
				} else {
					this.queryService.andIsNotRenote(query, 'note');
				}
			}

			if (ps.withFiles !== undefined) {
				query.andWhere(ps.withFiles ? 'note.fileIds != \'{}\'' : 'note.fileIds = \'{}\'');
			}

			if (ps.poll !== undefined) {
				query.andWhere(ps.poll ? 'note.hasPoll = TRUE' : 'note.hasPoll = FALSE');
			}

			// TODO
			//if (bot != undefined) {
			//	query.isBot = bot;
			//}

			const notes = await query.getMany();

			return await this.noteEntityService.packMany(notes);
		});
	}
}
