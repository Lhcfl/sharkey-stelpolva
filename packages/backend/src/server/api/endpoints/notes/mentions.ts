/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository, FollowingsRepository } from '@/models/_.js';
import { MiNote } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
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
		following: { type: 'boolean', default: false },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		visibility: { type: 'string' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private noteEntityService: NoteEntityService,
		private queryService: QueryService,
		private readonly activeUsersChart: ActiveUsersChart,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), ps.sinceId, ps.untilId)
				.innerJoin(qb => {
					qb
						.select('note.id', 'id')
						.from(qbb => qbb
							.select('note.id', 'id')
							.from(MiNote, 'note')
							.where(new Brackets(qbbb => qbbb
								// DM to me
								.orWhere(':meIdAsList <@ note.visibleUserIds')
								// Mentions me
								.orWhere(':meIdAsList <@ note.mentions'),
							))
							.setParameters({ meIdAsList: [me.id] })
						, 'source')
						.innerJoin(MiNote, 'note', 'note.id = source.id')
						.innerJoinAndSelect('note.user', 'user')
						.leftJoinAndSelect('note.reply', 'reply')
						.leftJoinAndSelect('note.renote', 'renote')
						.leftJoinAndSelect('reply.user', 'replyUser')
						.leftJoinAndSelect('renote.user', 'renoteUser');

					this.queryService.generateVisibilityQuery(qb, me);
					this.queryService.generateBlockedHostQueryForNote(qb);
					this.queryService.generateSuspendedUserQueryForNote(qb);
					this.queryService.generateSilencedUserQueryForNotes(qb, me);
					this.queryService.generateMutedUserQueryForNotes(qb, me);
					this.queryService.generateMutedNoteThreadQuery(qb, me);
					this.queryService.generateBlockedUserQueryForNotes(qb, me);
					// A renote can't mention a user, so it will never appear here anyway.
					//this.queryService.generateMutedUserRenotesQueryForNotes(qb, me);

					if (ps.visibility) {
						qb.andWhere('note.visibility = :visibility', { visibility: ps.visibility });
					}

					if (ps.following) {
						this.queryService
							.andFollowingUser(qb, ':meId', 'note.userId')
							.setParameters({ meId: me.id });
					}

					return qb;
				}, 'source', 'source.id = note.id')
				.limit(ps.limit);

			const mentions = await query.getMany();

			process.nextTick(() => {
				this.activeUsersChart.read(me);
			});

			return await this.noteEntityService.packMany(mentions, me);
		});
	}
}
