/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import type { NotesRepository, NoteThreadMutingsRepository } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { DI } from '@/di-symbols.js';
import { CacheService } from '@/core/CacheService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,

	kind: 'write:account',

	// Up to 10 calls, then 1/second
	limit: {
		type: 'bucket',
		size: 10,
		dripRate: 1000,
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '5ff67ada-ed3b-2e71-8e87-a1a421e177d2',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		noteOnly: { type: 'boolean', default: false },
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

		private getterService: GetterService,
		private idService: IdService,
		private readonly cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const note = await this.getterService.getNote(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});

			/*
			const mutedNotes = await this.notesRepository.find({
				where: [{
					id: note.threadId ?? note.id,
				}, {
					threadId: note.threadId ?? note.id,
				}],
			});
			*/

			const threadId = note.threadId ?? note.id;
			await this.noteThreadMutingsRepository.insert({
				id: this.idService.gen(),
				threadId: ps.noteOnly ? note.id : threadId,
				userId: me.id,
				isPostMute: ps.noteOnly,
			});

			await Promise.all([
				this.cacheService.threadMutingsCache.refresh(me.id),
				this.cacheService.noteMutingsCache.refresh(me.id),
			]);
		});
	}
}
