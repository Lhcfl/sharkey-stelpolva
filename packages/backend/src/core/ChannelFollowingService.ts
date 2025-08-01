/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { ChannelFollowingsRepository } from '@/models/_.js';
import { MiChannel } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEvents, GlobalEventService, InternalEventTypes } from '@/core/GlobalEventService.js';
import { bindThis } from '@/decorators.js';
import type { MiLocalUser } from '@/models/User.js';
import { QuantumKVCache } from '@/misc/QuantumKVCache.js';
import { InternalEventService } from './InternalEventService.js';

@Injectable()
export class ChannelFollowingService implements OnModuleInit {
	public userFollowingChannelsCache: QuantumKVCache<Set<string>>;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,
		@Inject(DI.channelFollowingsRepository)
		private channelFollowingsRepository: ChannelFollowingsRepository,
		private idService: IdService,
		private globalEventService: GlobalEventService,
		private readonly internalEventService: InternalEventService,
	) {
		this.userFollowingChannelsCache = new QuantumKVCache<Set<string>>(this.internalEventService, 'userFollowingChannels', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: (key) => this.channelFollowingsRepository.find({
				where: { followerId: key },
				select: ['followeeId'],
			}).then(xs => new Set(xs.map(x => x.followeeId))),
		});

		this.internalEventService.on('followChannel', this.onMessage);
		this.internalEventService.on('unfollowChannel', this.onMessage);
	}

	onModuleInit() {
	}

	@bindThis
	public async follow(
		requestUser: MiLocalUser,
		targetChannel: MiChannel,
	): Promise<void> {
		await this.channelFollowingsRepository.insert({
			id: this.idService.gen(),
			followerId: requestUser.id,
			followeeId: targetChannel.id,
		});

		this.globalEventService.publishInternalEvent('followChannel', {
			userId: requestUser.id,
			channelId: targetChannel.id,
		});
	}

	@bindThis
	public async unfollow(
		requestUser: MiLocalUser,
		targetChannel: MiChannel,
	): Promise<void> {
		await this.channelFollowingsRepository.delete({
			followerId: requestUser.id,
			followeeId: targetChannel.id,
		});

		this.globalEventService.publishInternalEvent('unfollowChannel', {
			userId: requestUser.id,
			channelId: targetChannel.id,
		});
	}

	@bindThis
	private async onMessage<E extends 'followChannel' | 'unfollowChannel'>(body: InternalEventTypes[E], type: E): Promise<void> {
		{
			switch (type) {
				case 'followChannel': {
					await this.userFollowingChannelsCache.delete(body.userId);
					break;
				}
				case 'unfollowChannel': {
					await this.userFollowingChannelsCache.delete(body.userId);
					break;
				}
			}
		}
	}

	@bindThis
	public dispose(): void {
		this.internalEventService.off('followChannel', this.onMessage);
		this.internalEventService.off('unfollowChannel', this.onMessage);
		this.userFollowingChannelsCache.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
