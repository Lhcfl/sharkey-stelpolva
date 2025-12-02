/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import * as Redis from 'ioredis';
import { ModuleRef } from '@nestjs/core';
import { In } from 'typeorm';
import type { MiMeta, UserListMembershipsRepository, UserListsRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';
import type { MiUserListMembership } from '@/models/UserListMembership.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import { QueueService } from '@/core/QueueService.js';
import type { RoleService } from '@/core/RoleService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { CacheService } from '@/core/CacheService.js';
import { CacheManagementService, type ManagedQuantumKVCache } from '@/global/CacheManagementService.js';

@Injectable()
export class UserListService implements OnModuleInit {
	public static TooManyUsersError = class extends Error {};

	public readonly userListsCache: ManagedQuantumKVCache<MiUserList>;

	private roleService: RoleService;

	constructor(
		private moduleRef: ModuleRef,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.userListMembershipsRepository)
		private userListMembershipsRepository: UserListMembershipsRepository,

		@Inject(DI.userListsRepository)
		private readonly userListsRepository: UserListsRepository,

		@Inject(DI.meta)
		private readonly meta: MiMeta,

		private userEntityService: UserEntityService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
		private queueService: QueueService,
		private systemAccountService: SystemAccountService,
		private readonly internalEventService: InternalEventService,
		private readonly cacheService: CacheService,

		cacheManagementService: CacheManagementService,
	) {
		this.userListsCache = cacheManagementService.createQuantumKVCache('userLists', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async id => await this.userListsRepository.findOneByOrFail({ id }),
			optionalFetcher: async id => await this.userListsRepository.findOneBy({ id }),
			bulkFetcher: async ids => {
				const lists = await this.userListsRepository.findBy({ id: In(ids) });
				return lists.map(list => [list.id, list]);
			},
		});
	}

	@bindThis
	async onModuleInit() {
		this.roleService = this.moduleRef.get('RoleService');
	}

	@bindThis
	public async addMember(target: MiUser, list: MiUserList, me: MiUser) {
		const [current, policies] = await Promise.all([
			this.cacheService.listUserMembershipsCache.fetch(list.id),
			this.roleService.getUserPolicies(me),
		]);
		if (current.size >= policies.userEachUserListsLimit) {
			throw new UserListService.TooManyUsersError();
		}

		await this.userListMembershipsRepository.insert({
			id: this.idService.gen(),
			userId: target.id,
			userListId: list.id,
			userListUserId: list.userId,
		} as MiUserListMembership);

		await this.internalEventService.emit('userListMemberAdded', { userListId: list.id, memberId: target.id });
		this.globalEventService.publishUserListStream(list.id, 'userAdded', await this.userEntityService.pack(target));

		// このインスタンス内にこのリモートユーザーをフォローしているユーザーがいなくても投稿を受け取るためにダミーのユーザーがフォローしたということにする
		if (this.userEntityService.isRemoteUser(target) && this.meta.enableProxyAccount) {
			const proxy = await this.systemAccountService.fetch('proxy');
			await this.queueService.createFollowJob([{ from: { id: proxy.id }, to: { id: target.id } }]);
		}
	}

	@bindThis
	public async removeMember(target: MiUser, list: MiUserList) {
		await this.userListMembershipsRepository.delete({
			userId: target.id,
			userListId: list.id,
		});

		await this.internalEventService.emit('userListMemberRemoved', { userListId: list.id, memberId: target.id });
		this.globalEventService.publishUserListStream(list.id, 'userRemoved', await this.userEntityService.pack(target));
	}

	@bindThis
	public async updateMembership(target: MiUser, list: MiUserList, options: { withReplies?: boolean }) {
		const membership = await this.cacheService.userListMembershipsCache
			.fetchMaybe(target.id)
			.then(ms => ms?.get(list.id));

		if (membership == null) {
			throw new Error('User is not a member of the list');
		}

		await this.userListMembershipsRepository.update({
			id: membership.id,
		}, {
			withReplies: options.withReplies,
		});

		await this.internalEventService.emit('userListMemberUpdated', { userListId: list.id, memberId: target.id });
	}

	@bindThis
	public async bulkAddMember(target: { id: MiUser['id'] }, memberships: { userListId: MiUserList['id'], withReplies?: boolean }[]): Promise<void> {
		const userListIds = memberships.map(m => m.userListId);
		const userLists = await this.userListsCache.fetchMany(userListIds);

		// Map userListId => userListUserId
		const listUserIds = new Map(userLists.values.map(l => [l.id, l.userId]));

		const toInsert = memberships.map(membership => ({
			id: this.idService.gen(),
			userId: target.id,
			userListId: membership.userListId,
			userListUserId: listUserIds.get(membership.userListId),
			withReplies: membership.withReplies,
		}));

		await this.userListMembershipsRepository.insert(toInsert);
		await this.internalEventService.emit('userListMemberBulkAdded', {
			memberId: target.id,
			userListIds,
		});

		const targetUser = await this.cacheService.findUserById(target.id);
		const packedUser = await this.userEntityService.pack(targetUser);
		await Promise.all(memberships.map(async membership => {
			await this.globalEventService.publishUserListStream(membership.userListId, 'userAdded', packedUser);
		}));

		// このインスタンス内にこのリモートユーザーをフォローしているユーザーがいなくても投稿を受け取るためにダミーのユーザーがフォローしたということにする
		if (this.userEntityService.isRemoteUser(targetUser) && this.meta.enableProxyAccount) {
			const proxy = await this.systemAccountService.fetch('proxy');
			await this.queueService.createFollowJob([{ from: { id: proxy.id }, to: { id: target.id } }]);
		}
	}

	@bindThis
	public async bulkRemoveMember(target: { id: MiUser['id'] }, memberships: { userListId: MiUserList['id'] }[] | MiUserList['id'][]): Promise<void> {
		const userListIds = memberships.map(mem => typeof(mem) === 'object' ? mem.userListId : mem);

		await this.userListMembershipsRepository.delete({
			userId: target.id,
			userListId: In(userListIds),
		});

		await this.internalEventService.emit('userListMemberBulkRemoved', {
			userListIds,
			memberId: target.id,
		});

		const targetUser = await this.cacheService.findUserById(target.id);
		const packedUser = await this.userEntityService.pack(targetUser);
		await Promise.all(userListIds.map(async userListId => {
			await this.globalEventService.publishUserListStream(userListId, 'userRemoved', packedUser);
		}));
	}

	@bindThis
	public async bulkUpdateMembership(target: { id: MiUser['id'] }, memberships: { userListId: MiUserList['id'], withReplies: boolean }[]): Promise<void> {
		const userListMemberships = await this.cacheService.userListMembershipsCache.fetch(target.id);
		const membershipChanges = memberships
			.map(mem => {
				const old = userListMemberships.get(mem.userListId);
				return {
					new: mem,
					id: old?.id ?? '',
					old,
				};
			});

		const toAddReplies = membershipChanges
			.filter(mem => mem.old != null && mem.new.withReplies && !mem.old.withReplies)
			.map(mem => mem.id);
		if (toAddReplies.length > 0) {
			await this.userListMembershipsRepository.update({ id: In(toAddReplies) }, { withReplies: true });
		}

		const toRemoveReplies = membershipChanges
			.filter(mem => mem.old != null && !mem.new.withReplies && mem.old.withReplies)
			.map(mem => mem.id);
		if (toRemoveReplies.length > 0) {
			await this.userListMembershipsRepository.update({ id: In(toRemoveReplies) }, { withReplies: false });
		}

		await this.internalEventService.emit('userListMemberBulkUpdated', {
			memberId: target.id,
			userListIds: memberships.map(m => m.userListId),
		});
	}
}
