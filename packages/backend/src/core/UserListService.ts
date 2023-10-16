/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { UserListJoiningsRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';
import type { MiUserListJoining } from '@/models/UserListJoining.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ProxyAccountService } from '@/core/ProxyAccountService.js';
import { bindThis } from '@/decorators.js';
import { RoleService } from '@/core/RoleService.js';
import { QueueService } from '@/core/QueueService.js';
import { RedisKVCache } from '@/misc/cache.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';

@Injectable()
export class UserListService implements OnApplicationShutdown {
	public static TooManyUsersError = class extends Error {};

	public membersCache: RedisKVCache<Set<string>>;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.userListJoiningsRepository)
		private userListJoiningsRepository: UserListJoiningsRepository,

		private userEntityService: UserEntityService,
		private idService: IdService,
		private roleService: RoleService,
		private globalEventService: GlobalEventService,
		private proxyAccountService: ProxyAccountService,
		private queueService: QueueService,
	) {
		this.membersCache = new RedisKVCache<Set<string>>(this.redisClient, 'userListMembers', {
			lifetime: 1000 * 60 * 30, // 30m
			memoryCacheLifetime: 1000 * 60, // 1m
			fetcher: (key) => this.userListJoiningsRepository.find({ where: { userListId: key }, select: ['userId'] }).then(xs => new Set(xs.map(x => x.userId))),
			toRedisConverter: (value) => JSON.stringify(Array.from(value)),
			fromRedisConverter: (value) => new Set(JSON.parse(value)),
		});

		this.redisForSub.on('message', this.onMessage);
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'userListMemberAdded': {
					const { userListId, memberId } = body;
					const members = await this.membersCache.get(userListId);
					if (members) {
						members.add(memberId);
					}
					break;
				}
				case 'userListMemberRemoved': {
					const { userListId, memberId } = body;
					const members = await this.membersCache.get(userListId);
					if (members) {
						members.delete(memberId);
					}
					break;
				}
				default:
					break;
			}
		}
	}

	@bindThis
	public async addMember(target: MiUser, list: MiUserList, me: MiUser) {
		const currentCount = await this.userListJoiningsRepository.countBy({
			userListId: list.id,
		});
		if (currentCount > (await this.roleService.getUserPolicies(me.id)).userEachUserListsLimit) {
			throw new UserListService.TooManyUsersError();
		}

		await this.userListJoiningsRepository.insert({
			id: this.idService.genId(),
			createdAt: new Date(),
			userId: target.id,
			userListId: list.id,
		} as MiUserListJoining);

		this.globalEventService.publishInternalEvent('userListMemberAdded', { userListId: list.id, memberId: target.id });
		this.globalEventService.publishUserListStream(list.id, 'userAdded', await this.userEntityService.pack(target));

		// このインスタンス内にこのリモートユーザーをフォローしているユーザーがいなくても投稿を受け取るためにダミーのユーザーがフォローしたということにする
		if (this.userEntityService.isRemoteUser(target)) {
			const proxy = await this.proxyAccountService.fetch();
			if (proxy) {
				this.queueService.createFollowJob([{ from: { id: proxy.id }, to: { id: target.id } }]);
			}
		}
	}

	@bindThis
	public async removeMember(target: MiUser, list: MiUserList) {
		await this.userListJoiningsRepository.delete({
			userId: target.id,
			userListId: list.id,
		});

		this.globalEventService.publishInternalEvent('userListMemberRemoved', { userListId: list.id, memberId: target.id });
		this.globalEventService.publishUserListStream(list.id, 'userRemoved', await this.userEntityService.pack(target));
	}

	@bindThis
	public dispose(): void {
		this.redisForSub.off('message', this.onMessage);
		this.membersCache.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
