/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets, In } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository, MutingsRepository, PollsRepository, PollVotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '@/server/api/error.js';

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
		ltlDisabled: {
			message: 'Local timeline has been disabled.',
			code: 'LTL_DISABLED',
			id: '45a6eb02-7695-4393-b023-dd3be9aaaefd',
		},
		gtlDisabled: {
			message: 'Global timeline has been disabled.',
			code: 'GTL_DISABLED',
			id: '0332fc13-6ab2-4427-ae80-a9fadffd1a6b',
		},
	},

	// Up to 10 calls, then 2 per second
	limit: {
		type: 'bucket',
		size: 10,
		dripRate: 500,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
		excludeChannels: { type: 'boolean', default: false },
		local: { type: 'boolean', nullable: true, default: null },
		expired: { type: 'boolean', default: false },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.pollsRepository)
		private pollsRepository: PollsRepository,

		@Inject(DI.pollVotesRepository)
		private pollVotesRepository: PollVotesRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		private noteEntityService: NoteEntityService,
		private readonly queryService: QueryService,
		private readonly roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.pollsRepository.createQueryBuilder('poll')
				.innerJoinAndSelect('poll.note', 'note')
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('renote.user', 'renoteUser')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.andWhere('user.isExplorable = TRUE')
			;

			if (me) {
				query.andWhere('poll.userId != :meId', { meId: me.id });
			}

			if (ps.expired) {
				query.andWhere('poll.expiresAt IS NOT NULL');
				query.andWhere('poll.expiresAt <= :expiresMax', {
					expiresMax: new Date(),
				});
				query.andWhere('poll.expiresAt >= :expiresMin', {
					expiresMin: new Date(Date.now() - (1000 * 60 * 60 * 24 * 7)),
				});
			} else {
				query.andWhere(new Brackets(qb => {
					qb
						.where('poll.expiresAt IS NULL')
						.orWhere('poll.expiresAt > :now', { now: new Date() });
				}));
			}

			const policies = await this.roleService.getUserPolicies(me?.id ?? null);
			if (ps.local != null) {
				if (ps.local) {
					if (!policies.ltlAvailable) throw new ApiError(meta.errors.ltlDisabled);
					query.andWhere('poll.userHost IS NULL');
				} else {
					if (!policies.gtlAvailable) throw new ApiError(meta.errors.gtlDisabled);
					query.andWhere('poll.userHost IS NOT NULL');
				}
			} else {
				if (!policies.gtlAvailable) throw new ApiError(meta.errors.gtlDisabled);
			}

			/*
			//#region exclude arleady voted polls
			const votedQuery = this.pollVotesRepository.createQueryBuilder('vote')
				.select('vote.noteId')
				.where('vote.userId = :meId', { meId: me.id });

			query
				.andWhere(`poll.noteId NOT IN (${ votedQuery.getQuery() })`);

			query.setParameters(votedQuery.getParameters());
			//#endregion
			*/

			//#region block/mute/vis
			this.queryService.generateVisibilityQuery(query, me);
			this.queryService.generateSilencedUserQueryForNotes(query, me);
			this.queryService.generateSuspendedUserQueryForNote(query);
			this.queryService.generateBlockedHostQueryForNote(query);
			if (me) {
				this.queryService.generateBlockedUserQueryForNotes(query, me);
				this.queryService.generateMutedUserQueryForNotes(query, me);
				this.queryService.generateMutedNoteThreadQuery(query, me);
			}
			//#endregion

			//#region exclude channels
			if (ps.excludeChannels) {
				query.andWhere('poll.channelId IS NULL');
			}
			//#endregion

			const polls = await query
				.orderBy('poll.noteId', 'DESC')
				.limit(ps.limit)
				.offset(ps.offset)
				.getMany();

			if (polls.length === 0) return [];

			/*
			const notes = await this.notesRepository.find({
				where: {
					id: In(polls.map(poll => poll.noteId)),
				},
				order: {
					id: 'DESC',
				},
			});
			*/

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const notes = polls.map(poll => poll.note!);

			return await this.noteEntityService.packMany(notes, me, {
				detail: true,
			});
		});
	}
}
