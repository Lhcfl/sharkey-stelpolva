/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import type { NotesRepository } from '@/models/_.js';
import { QueryService } from '@/core/QueryService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Note',
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '24fcbfc6-2e37-42b6-8388-c29b3861a08d',
		},
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
		
		private noteEntityService: NoteEntityService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = await this.notesRepository.createQueryBuilder('note')
				.where('note.id = :noteId', { noteId: ps.noteId });

			this.queryService.generateVisibilityQuery(query, me);
			if (me) {
				this.queryService.generateMutedUserQuery(query, me);
				this.queryService.generateBlockedUserQuery(query, me);
			}
			
			const note = await query.getOne();

			if (note === null) {
				throw new ApiError(meta.errors.noSuchNote);
			}

			return await this.noteEntityService.pack(note, me, {
				detail: true,
			});
		});
	}
}
