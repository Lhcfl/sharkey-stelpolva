/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository, FollowingsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserService } from '@/core/UserService.js';
import { QueryService } from '@/core/QueryService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';

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
		visibility: { type: 'string', enum: ['public', 'home', 'followers', 'specified'] },
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
		private readonly userService: UserService,
	) {
		super(meta, paramDef, async (ps, me) => {
			this.userService.markUserActive(me);

			const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), ps.sinceId, ps.untilId)
				.limit(ps.limit)
				.setParameters({
					meId: me.id,
					meIdAsList: [me.id],
				});

			// Visibility check is covered in a more-efficient way below.
			// this.queryService.generateVisibilityQuery(query, me);
			this.queryService.generateBlockedHostQueryForNote(query);
			this.queryService.generateSuspendedUserQueryForNote(query);
			this.queryService.generateSilencedUserQueryForNotes(query, me);
			this.queryService.generateMutedUserQueryForNotes(query, me);
			this.queryService.generateMutedNoteThreadQuery(query, me);
			// Blocked check is conditionally-applied below.
			// this.queryService.generateBlockedUserQueryForNotes(query, me);
			// A renote can't mention a user, so it will never appear here anyway.
			//this.queryService.generateMutedUserRenotesQueryForNotes(query, me);

			if (ps.visibility === 'specified') {
				// DM to me
				query
					.andWhere('note.visibility = \'specified\'')
					.andWhere(':meIdAsList <@ note.visibleUserIds');
			} else if (ps.visibility) {
				// Non-DM that mentions me
				query
					.andWhere('note.visibility = :visibility', { visibility: ps.visibility })
					.andWhere(':meIdAsList <@ note.mentions');
			} else {
				query
					.andWhere(new Brackets(qb => qb
						// DM to me
						.orWhere(new Brackets(qbb => qbb
							.andWhere('note.visibility = \'specified\'')
							.andWhere(':meIdAsList <@ note.visibleUserIds')))
						// Non-DM that mentions me
						.orWhere(new Brackets(qbb => qbb
							.andWhere('note.visibility != \'specified\'')
							.andWhere(':meIdAsList <@ note.mentions'))),
					));
			}

			// We can't be following a user who blocks us / is blocked by us, so only one check is needed.
			if (ps.following) {
				this.queryService.andFollowingUser(query, ':meId', 'note.userId');
			} else {
				this.queryService.generateBlockedUserQueryForNotes(query, me);
			}

			const mentions = await query.getMany();
			return await this.noteEntityService.packMany(mentions, me);
		});
	}
}
