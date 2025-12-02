/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { AvatarDecorationsRepository, MiAvatarDecoration, MiUser } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { MemorySingleCache } from '@/misc/cache.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { CacheManagementService, type ManagedMemorySingleCache } from '@/global/CacheManagementService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { TimeService } from '@/global/TimeService.js';

@Injectable()
export class AvatarDecorationService implements OnApplicationShutdown {
	public cache: ManagedMemorySingleCache<MiAvatarDecoration[]>;

	constructor(
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.avatarDecorationsRepository)
		private avatarDecorationsRepository: AvatarDecorationsRepository,

		private idService: IdService,
		private moderationLogService: ModerationLogService,
		private globalEventService: GlobalEventService,
		private readonly internalEventService: InternalEventService,
		private readonly timeService: TimeService,

		cacheManagementService: CacheManagementService,
	) {
		this.cache = cacheManagementService.createMemorySingleCache<MiAvatarDecoration[]>('avatarDecorations', 1000 * 60 * 30); // 30s

		this.internalEventService.on('avatarDecorationCreated', this.onAvatarEvent);
		this.internalEventService.on('avatarDecorationUpdated', this.onAvatarEvent);
		this.internalEventService.on('avatarDecorationDeleted', this.onAvatarEvent);
	}

	@bindThis
	private onAvatarEvent(): void {
		this.cache.delete();
	}

	@bindThis
	public async create(options: Partial<MiAvatarDecoration>, moderator?: MiUser): Promise<MiAvatarDecoration> {
		const created = await this.avatarDecorationsRepository.insertOne({
			id: this.idService.gen(),
			...options,
		});

		await this.internalEventService.emit('avatarDecorationCreated', created);

		if (moderator) {
			this.moderationLogService.log(moderator, 'createAvatarDecoration', {
				avatarDecorationId: created.id,
				avatarDecoration: created,
			});
		}

		return created;
	}

	@bindThis
	public async update(id: MiAvatarDecoration['id'], params: Partial<MiAvatarDecoration>, moderator?: MiUser): Promise<void> {
		const avatarDecoration = await this.avatarDecorationsRepository.findOneByOrFail({ id });

		const date = this.timeService.date;
		await this.avatarDecorationsRepository.update(avatarDecoration.id, {
			updatedAt: date,
			...params,
		});

		const updated = await this.avatarDecorationsRepository.findOneByOrFail({ id: avatarDecoration.id });
		await this.internalEventService.emit('avatarDecorationUpdated', updated);

		if (moderator) {
			this.moderationLogService.log(moderator, 'updateAvatarDecoration', {
				avatarDecorationId: avatarDecoration.id,
				before: avatarDecoration,
				after: updated,
			});
		}
	}

	@bindThis
	public async delete(id: MiAvatarDecoration['id'], moderator?: MiUser): Promise<void> {
		const avatarDecoration = await this.avatarDecorationsRepository.findOneByOrFail({ id });

		await this.avatarDecorationsRepository.delete({ id: avatarDecoration.id });
		await this.internalEventService.emit('avatarDecorationDeleted', avatarDecoration);

		if (moderator) {
			this.moderationLogService.log(moderator, 'deleteAvatarDecoration', {
				avatarDecorationId: avatarDecoration.id,
				avatarDecoration: avatarDecoration,
			});
		}
	}

	@bindThis
	public async getAll(noCache = false): Promise<MiAvatarDecoration[]> {
		if (noCache) {
			this.cache.delete();
		}
		return await this.cache.fetch(() => this.avatarDecorationsRepository.find());
	}

	@bindThis
	public dispose(): void {
		this.internalEventService.off('avatarDecorationCreated', this.onAvatarEvent);
		this.internalEventService.off('avatarDecorationUpdated', this.onAvatarEvent);
		this.internalEventService.off('avatarDecorationDeleted', this.onAvatarEvent);
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
