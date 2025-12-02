/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiUserListMembership, UserListMembershipsRepository, UserListsRepository } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import type { } from '@/models/Blocking.js';
import type { MiUserList } from '@/models/UserList.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { CacheService } from '@/core/CacheService.js';
import { UserListService } from '@/core/UserListService.js';
import { UserEntityService } from './UserEntityService.js';

@Injectable()
export class UserListEntityService {
	constructor(
		@Inject(DI.userListsRepository)
		private userListsRepository: UserListsRepository,

		@Inject(DI.userListMembershipsRepository)
		private userListMembershipsRepository: UserListMembershipsRepository,

		private userEntityService: UserEntityService,
		private idService: IdService,
		private readonly cacheService: CacheService,
		private readonly userListService: UserListService,
	) {
	}

	@bindThis
	public async pack(
		src: MiUserList['id'] | MiUserList,
		meId: string | null | undefined,
	): Promise<Packed<'UserList'>> {
		const srcId = typeof(src) === 'object' ? src.id : src;

		const [userList, users, favorites] = await Promise.all([
			typeof src === 'object' ? src : this.userListService.userListsCache.fetch(src),
			this.cacheService.listUserMembershipsCache.fetch(srcId),
			this.cacheService.listUserFavoritesCache.fetch(srcId),
		]);

		return {
			id: userList.id,
			createdAt: this.idService.parse(userList.id).date.toISOString(),
			createdBy: userList.userId,
			name: userList.name,
			userIds: users.keys().toArray(),
			isPublic: userList.isPublic,
			isLiked: meId != null
				? favorites.has(meId)
				: undefined,
			likedCount: userList.isPublic || meId === userList.userId
				? favorites.size
				: undefined,
		};
	}

	@bindThis
	public async packMembershipsMany(
		memberships: MiUserListMembership[],
	) {
		const _users = memberships.map(({ user, userId }) => user ?? userId);
		const _userMap = await this.userEntityService.packMany(_users)
			.then(users => new Map(users.map(u => [u.id, u])));
		return await Promise.all(memberships.map(async x => ({
			id: x.id,
			createdAt: this.idService.parse(x.id).date.toISOString(),
			userId: x.userId,
			user: _userMap.get(x.userId) ?? await this.userEntityService.pack(x.userId),
			withReplies: x.withReplies,
		})));
	}
}

