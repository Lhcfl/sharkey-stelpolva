/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import type { MiUser } from '@/models/User.js';
import type { UserKeypairsRepository } from '@/models/_.js';
import type { MiUserKeypair } from '@/models/UserKeypair.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { IsOne } from '@/misc/is-one.js';
import { CacheManagementService, type ManagedQuantumKVCache } from '@/global/CacheManagementService.js';
import { InternalEventService, type InternalEventTypes } from '@/global/InternalEventService.js';

@Injectable()
export class UserKeypairService implements OnApplicationShutdown {
	public readonly userKeypairCache: ManagedQuantumKVCache<MiUserKeypair>;

	constructor(
		@Inject(DI.userKeypairsRepository)
		private userKeypairsRepository: UserKeypairsRepository,

		private readonly internalEventService: InternalEventService,

		cacheManagementService: CacheManagementService,
	) {
		this.userKeypairCache = cacheManagementService.createQuantumKVCache('userKeypair', {
			lifetime: 1000 * 60 * 60, // 1h
			fetcher: async userId => await this.userKeypairsRepository.findOneByOrFail({ userId }),
			optionalFetcher: async userId => await this.userKeypairsRepository.findOneBy({ userId }),
			bulkFetcher: async userIds => {
				const keypairs = await this.userKeypairsRepository.findBy({ userId: IsOne(userIds) });
				return keypairs.map(keypair => [keypair.userId, keypair]);
			},
		});

		this.internalEventService.on('userChangeDeletedState', this.onUserDeleted);
	}

	@bindThis
	public async getUserKeypair(userId: MiUser['id']): Promise<MiUserKeypair> {
		return await this.userKeypairCache.fetch(userId);
	}

	@bindThis
	public async getUserKeypairMaybe(userId: MiUser['id']): Promise<MiUserKeypair | undefined> {
		return await this.userKeypairCache.fetchMaybe(userId);
	}

	@bindThis
	private async onUserDeleted(body: InternalEventTypes['userChangeDeletedState']): Promise<void> {
		await this.userKeypairCache.delete(body.id);
	}

	@bindThis
	public dispose(): void {
		this.internalEventService.off('userChangeDeletedState', this.onUserDeleted);
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
