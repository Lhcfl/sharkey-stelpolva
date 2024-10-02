/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { LatestNote, MiFollowing, MiBlocking, MiMuting, MiUserProfile } from '@/models/_.js';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';

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
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		mutualsOnly: { type: 'boolean', default: false },
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
	) {
		super(meta, paramDef, async (ps, me) => {
			let query = this.notesRepository
				.createQueryBuilder('note')
				.innerJoin(MiUserProfile, 'user_profile', ':me = user_profile."userId"')
				.setParameter('me', me.id)

				// Limit to latest notes
				.innerJoin(LatestNote, 'latest', 'note.id = latest.note_id')

				// Avoid N+1 queries from the "pack" method
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.leftJoinAndSelect('renote.user', 'renoteUser')
				.leftJoinAndSelect('note.channel', 'channel')

				// Respect blocks and mutes for latest note
				.leftJoin(MiBlocking, 'blocking_note', 'note."userId" = blocking_note."blockerId"')
				.leftJoin(MiMuting, 'muting_note', 'note."userId" = muting_note."muteeId"')
				.andWhere('blocking_note.id IS NULL AND muting_note.id IS NULL')
				.andWhere('(note."userHost" IS NULL OR NOT user_profile."mutedInstances" ? note."userHost")')

				// Respect blocks and mutes for renote
				.leftJoin(MiBlocking, 'blocking_renote', 'renote."userId" IS NOT NULL AND renote."userId" = blocking_renote."blockerId"')
				.leftJoin(MiMuting, 'muting_renote', 'renote."userId" IS NOT NULL AND renote."userId" = muting_renote."muteeId"')
				.andWhere('blocking_renote.id IS NULL AND muting_renote.id IS NULL')
				.andWhere('(renote."userHost" IS NULL OR NOT user_profile."mutedInstances" ? renote."userHost")')

				// Respect blocks and mutes for reply
				.leftJoin(MiBlocking, 'blocking_reply', 'reply."userId" IS NOT NULL AND reply."userId" = blocking_reply."blockerId"')
				.leftJoin(MiMuting, 'muting_reply', 'reply."userId" IS NOT NULL AND reply."userId" = muting_reply."muteeId"')
				.andWhere('blocking_reply.id IS NULL AND muting_reply.id IS NULL')
				.andWhere('(reply."userHost" IS NULL OR NOT user_profile."mutedInstances" ? reply."userHost")')

				// Limit to followers
				.innerJoin(MiFollowing, 'following', 'latest.user_id = following."followeeId"')
				.andWhere('following."followerId" = :me');

			// Limit to mutuals, if requested
			if (ps.mutualsOnly) {
				query = query
					.innerJoin(MiFollowing, 'mutuals', 'latest.user_id = mutuals."followerId" AND mutuals."followeeId" = :me');
			}

			// Support pagination
			query = this.queryService
				.makePaginationQuery(query, ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
				.orderBy('note.id', 'DESC')
				.take(ps.limit);

			// Query and return the next page
			const notes = await query.getMany();
			return await this.noteEntityService.packMany(notes, me);
		});
	}
}
