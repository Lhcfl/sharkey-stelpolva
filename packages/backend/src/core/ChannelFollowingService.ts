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
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { bindThis } from '@/decorators.js';
import type { MiLocalUser } from '@/models/User.js';
import { InternalEventService } from '@/global/InternalEventService.js';

@Injectable()
export class ChannelFollowingService {
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
	) {}

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

		await this.internalEventService.emit('followChannel', {
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

		await this.internalEventService.emit('unfollowChannel', {
			userId: requestUser.id,
			channelId: targetChannel.id,
		});
	}
}
