/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UserListsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { CacheService } from '@/core/CacheService.js';
import { UserListService } from '@/core/UserListService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['lists'],

	requireCredential: true,

	kind: 'write:account',

	description: 'Delete an existing list of users.',

	errors: {
		noSuchList: {
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '78436795-db79-42f5-b1e2-55ea2cf19166',
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
	},
	required: ['listId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userListsRepository)
		private userListsRepository: UserListsRepository,

		private readonly cacheService: CacheService,
		private readonly userListService: UserListService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const [userList, listMembership, listFavorites] = await Promise.all([
				this.userListService.userListsCache.fetchMaybe(ps.listId),
				this.cacheService.listUserMembershipsCache.fetch(ps.listId),
				this.cacheService.listUserFavoritesCache.fetch(ps.listId),
			]);

			if (userList == null || userList.userId !== me.id) {
				throw new ApiError(meta.errors.noSuchList);
			}

			await Promise.all([
				this.userListsRepository.delete(userList.id),
				this.userListService.userListsCache.delete(userList.id),
				this.cacheService.listUserFavoritesCache.delete(userList.id),
				this.cacheService.listUserMembershipsCache.delete(userList.id),
				this.cacheService.userListFavoritesCache.deleteMany(listFavorites),
				this.cacheService.userListMembershipsCache.deleteMany(listMembership.keys()),
			]);
		});
	}
}
