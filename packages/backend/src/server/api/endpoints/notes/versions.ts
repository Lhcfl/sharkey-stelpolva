/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { NotesRepository } from '@/models/_.js';
import { GetterService } from '@/server/api/GetterService.js';
import { QueryService } from '@/core/QueryService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: false,

	res: {
		type: 'array',
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				oldDate: {
					type: 'string',
					optional: false, nullable: false,
				},
				updatedAt: {
					type: 'string',
					optional: false, nullable: false,
				},
				text: {
					type: 'string',
					optional: false, nullable: true,
				},
			},
		},
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '24fcbfc6-2e37-42b6-8388-c29b3861a08d',
		},

		signinRequired: {
			message: 'Signin required.',
			code: 'SIGNIN_REQUIRED',
			id: '8e75455b-738c-471d-9f80-62693f33372e',
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
		noteId: { type: 'string', format: 'misskey:id' },
	},
	required: ['noteId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private getterService: GetterService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.notesRepository.createQueryBuilder('note')
				.where('note.id = :noteId', { noteId: ps.noteId })
				.innerJoinAndSelect('note.user', 'user');

			this.queryService.generateVisibilityQuery(query, me);
			if (me) {
				this.queryService.generateBlockedUserQueryForNotes(query, me);
			}

			const note = await query.getOne();

			if (note === null) {
				throw new ApiError(meta.errors.noSuchNote);
			}

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			if (note.user!.requireSigninToViewContents && me == null) {
				throw new ApiError(meta.errors.signinRequired);
			}

			const edits = await this.getterService.getEdits(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});

			let editArray: { oldDate: string, updatedAt: string, text: string | null }[] = [];

			for (const edit of edits) {
				editArray.push({
					oldDate: (edit.oldDate ?? edit.updatedAt).toISOString(),
					updatedAt: edit.updatedAt.toISOString(),
					text: edit.text ?? null,
				});
			}

			editArray = editArray.sort((a, b) => { return new Date(b.oldDate).getTime() - new Date(a.oldDate).getTime(); });

			return editArray;
		});
	}
}
