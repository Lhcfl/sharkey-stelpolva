/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository, NoteThreadMutingsRepository, NoteFavoritesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { CacheService } from '@/core/CacheService.js';
import { QueryService } from '@/core/QueryService.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			isFavorited: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			isMutedThread: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			isMutedNote: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			isRenoted: {
				type: 'boolean',
				optional: false, nullable: false,
			},
		},
	},

	// 10 calls per second
	limit: {
		duration: 1000,
		max: 10,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
	},
	required: ['noteId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.noteThreadMutingsRepository)
		private noteThreadMutingsRepository: NoteThreadMutingsRepository,

		@Inject(DI.noteFavoritesRepository)
		private noteFavoritesRepository: NoteFavoritesRepository,

		private readonly cacheService: CacheService,
		private readonly queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const note = await this.notesRepository.findOneByOrFail({ id: ps.noteId });

			const [favorite, threadMuting, noteMuting, renoted] = await Promise.all([
				// favorite
				this.noteFavoritesRepository.exists({
					where: {
						userId: me.id,
						noteId: note.id,
					},
				}),
				// treadMuting
				this.cacheService.threadMutingsCache.fetch(me.id).then(ms => ms.has(note.threadId ?? note.id)),
				// noteMuting
				this.cacheService.noteMutingsCache.fetch(me.id).then(ms => ms.has(note.id)),
				// renoted
				this.notesRepository
					.createQueryBuilder('note')
					.andWhere({ renoteId: note.id, userId: me.id })
					.andWhere(qb => this.queryService
						.andIsRenote(qb, 'note'))
					.getExists(),
			]);

			return {
				isFavorited: favorite,
				isMutedThread: threadMuting,
				isMutedNote: noteMuting,
				isRenoted: renoted,
			};
		});
	}
}
