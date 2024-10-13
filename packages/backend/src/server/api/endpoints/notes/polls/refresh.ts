/*
 * SPDX-FileCopyrightText: marie and sharkey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { ApQuestionService } from '@/core/activitypub/models/ApQuestionService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:votes',

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: 'ecafbd2e-c283-4d6d-aecb-1a0a33b75396',
		},

		noPoll: {
			message: 'The note does not attach a poll.',
			code: 'NO_POLL',
			id: '5f979967-52d9-4314-a911-1c673727f92f',
		},

		noUri: {
			message: 'The note has no URI defined.',
			code: 'INVALID_URI',
			id: 'e0cc9a04-f2e8-41e4-a5f1-4127293260ca',
		},

		youHaveBeenBlocked: {
			message: 'You cannot refresh this poll because you have been blocked by this user.',
			code: 'YOU_HAVE_BEEN_BLOCKED',
			id: '85a5377e-b1e9-4617-b0b9-5bea73331e49',
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

// TODO: ロジックをサービスに切り出す

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private getterService: GetterService,
		private userBlockingService: UserBlockingService,
		private apQuestionService: ApQuestionService,
		private noteEntityService: NoteEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Get note
			const note = await this.getterService.getNote(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});

			if (!note.hasPoll) {
				throw new ApiError(meta.errors.noPoll);
			}

			// Check blocking
			if (note.userId !== me.id) {
				const blocked = await this.userBlockingService.checkBlocked(note.userId, me.id);
				if (blocked) {
					throw new ApiError(meta.errors.youHaveBeenBlocked);
				}
			}

			if (!note.uri) {
				throw new ApiError(meta.errors.noUri);
			}

			await this.apQuestionService.updateQuestion(note.uri);

			return await this.noteEntityService.pack(note, me, {
				detail: true,
			});
		});
	}
}
