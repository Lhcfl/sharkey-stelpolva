/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { LatestNote, MiFollowing, MiBlocking, MiMuting } from '@/models/_.js';
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
			const query = this.notesRepository
				.createQueryBuilder('note')

				// Limit to latest notes
				.innerJoin(LatestNote, 'latest', 'note.id = latest.note_id')

				// Avoid N+1 queries from the "pack" method
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.leftJoinAndSelect('renote.user', 'renoteUser')
				.leftJoinAndSelect('note.channel', 'channel')

				// Respect blocks and mutes
				.leftJoin(MiBlocking, 'b', 'note."userId" = b."blockerId"')
				.leftJoin(MiMuting, 'm', 'note."userId" = m."muteeId"')
				.where('b.id IS NULL AND m.id IS NULL')

				// Limit to followers
				.innerJoin(MiFollowing, 'following', 'latest.user_id = following."followeeId"')
				.andWhere('following."followerId" = :me', { me: me.id })

				// Support pagination
				.orderBy('note.id', 'DESC')
				.take(ps.limit);

			// Query and return the next page
			const notes = await this.queryService
				.makePaginationQuery(query, ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
				.getMany();
			return await this.noteEntityService.packMany(notes, me);
		});
	}
}
