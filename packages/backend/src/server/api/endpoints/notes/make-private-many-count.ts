/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { DI } from '@/di-symbols.js';
import { GetterService } from '@/server/api/GetterService.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,

	kind: 'write:notes',

	limit: {
		duration: ms('1hour'),
		max: 300,
		minInterval: ms('1sec'),
	},

	errors: {
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: 'fe8d7103-0ea8-4ec3-814d-f8b401dc69e9',
		},
	},

	res: {
		type: 'number',
		optional: false, nullable: false,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		untilDate: { type: 'integer' },
		sinceDate: { type: 'integer' },
	},
	required: ['untilDate', 'sinceDate'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		// private getterService: GetterService,
		// private roleService: RoleService,
		private noteDeleteService: NoteDeleteService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const sinceDate = ps.sinceDate || 0;
			const untilDate = ps.untilDate || Date.now();
			if (sinceDate > untilDate) { return 0; }
			return await this.noteDeleteService.makePrivateMany(me, sinceDate, untilDate, true);
		});
	}
}
