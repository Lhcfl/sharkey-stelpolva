/*
 * SPDX-FileCopyrightText: syuilo and misskey-project , Type4ny-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { RenoteMutingsRepository } from '@/models/_.js';
import type { MiRenoteMuting } from '@/models/RenoteMuting.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { IdService } from '@/core/IdService.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { CacheService } from '@/core/CacheService.js';

@Injectable()
export class UserRenoteMutingService {
	constructor(
		@Inject(DI.renoteMutingsRepository)
		private renoteMutingsRepository: RenoteMutingsRepository,

		private idService: IdService,
		private cacheService: CacheService,
		private internalEventService: InternalEventService,
	) {
	}

	@bindThis
	public async mute(user: MiUser, target: MiUser, expiresAt: Date | null = null): Promise<void> {
		await this.renoteMutingsRepository.insert({
			id: this.idService.gen(),
			muterId: user.id,
			muteeId: target.id,
		});

		await this.internalEventService.emit('muteRenotes', { muterId: user.id, muteeId: target.id });
	}

	@bindThis
	public async unmute(mutings: MiRenoteMuting[]): Promise<void> {
		if (mutings.length === 0) return;

		await this.renoteMutingsRepository.delete({
			id: In(mutings.map(m => m.id)),
		});

		const groups = mutings.reduce((map, mute) => {
			let group = map.get(mute.muterId);
			if (!group) {
				group = [];
				map.set(mute.muterId, group);
			}
			group.push(mute.muteeId);
			return map;
		}, new Map<string, string[]>);

		for (const [muterId, muteeId] of groups) {
			await this.internalEventService.emit('unmuteRenotes', { muterId, muteeId });
		}
	}
}
