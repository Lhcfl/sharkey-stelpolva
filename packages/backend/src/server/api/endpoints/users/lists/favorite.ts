/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UserListFavoritesRepository, UserListsRepository } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { ApiError } from '@/server/api/error.js';
import { DI } from '@/di-symbols.js';
import { CacheService } from '@/core/CacheService.js';
import { UserListService } from '@/core/UserListService.js';

export const meta = {
	requireCredential: true,
	kind: 'write:account',
	errors: {
		noSuchList: {
			message: 'No such user list.',
			code: 'NO_SUCH_USER_LIST',
			id: '7dbaf3cf-7b42-4b8f-b431-b3919e580dbe',
		},

		alreadyFavorited: {
			message: 'The list has already been favorited.',
			code: 'ALREADY_FAVORITED',
			id: '6425bba0-985b-461e-af1b-518070e72081',
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

@Injectable() // eslint-disable-next-line import/no-default-export
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor (
		@Inject(DI.userListsRepository)
		private userListsRepository: UserListsRepository,

		@Inject(DI.userListFavoritesRepository)
		private userListFavoritesRepository: UserListFavoritesRepository,

		private readonly cacheService: CacheService,
		private readonly userListService: UserListService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const [userListExist, myFavorites, listFavorites] = await Promise.all([
				this.userListService.userListsCache.fetchMaybe(ps.listId),
				this.cacheService.userListFavoritesCache.fetch(me.id),
				this.cacheService.listUserFavoritesCache.fetch(ps.listId),
			]);

			if (!userListExist) {
				throw new ApiError(meta.errors.noSuchList);
			}

			if (!userListExist.isPublic && userListExist.userId !== me.id) {
				throw new ApiError(meta.errors.noSuchList);
			}

			if (myFavorites.has(ps.listId) || listFavorites.has(me.id)) {
				throw new ApiError(meta.errors.alreadyFavorited);
			}

			await this.userListFavoritesRepository.insert({
				id: this.idService.gen(),
				userId: me.id,
				userListId: ps.listId,
			});

			// Update caches directly since the Set instances are shared
			myFavorites.add(ps.listId);
			listFavorites.add(me.id);
		});
	}
}
