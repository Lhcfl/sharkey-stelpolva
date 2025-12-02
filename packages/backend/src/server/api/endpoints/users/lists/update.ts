/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UserListsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserListEntityService } from '@/core/entities/UserListEntityService.js';
import { DI } from '@/di-symbols.js';
import { UserListService } from '@/core/UserListService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['lists'],

	requireCredential: true,

	kind: 'write:account',

	description: 'Update the properties of a list.',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'UserList',
	},

	errors: {
		noSuchList: {
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '796666fe-3dff-4d39-becb-8a5932c1d5b7',
		},
	},

	// 5 calls per second
	limit: {
		duration: 1000,
		max: 5,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		listId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1, maxLength: 100 },
		isPublic: { type: 'boolean' },
	},
	required: ['listId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userListsRepository)
		private userListsRepository: UserListsRepository,

		private userListEntityService: UserListEntityService,
		private readonly userListService: UserListService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const userList = await this.userListService.userListsCache.fetchMaybe(ps.listId);

			if (userList == null || userList.userId !== me.id) {
				throw new ApiError(meta.errors.noSuchList);
			}

			await Promise.all([
				this.userListsRepository.update(userList.id, {
					name: ps.name,
					isPublic: ps.isPublic,
				}),
				this.userListService.userListsCache.delete(userList.id),
			]);

			return await this.userListEntityService.pack(userList.id, me.id);
		});
	}
}
