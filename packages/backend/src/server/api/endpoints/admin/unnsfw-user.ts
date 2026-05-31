/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { CacheService } from '@/core/CacheService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { InternalEventService } from '@/global/InternalEventService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:unnsfw-user',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private readonly userProfilesRepository: UserProfilesRepository,

		private readonly cacheService: CacheService,
		private readonly moderationLogService: ModerationLogService,
		private readonly internalEventService: InternalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const profile = await this.cacheService.userProfileCache.fetch(ps.userId);

			if (!profile.alwaysMarkNsfw) return;

			const user = await this.cacheService.findUserById(ps.userId);

			await this.userProfilesRepository.update(user.id, {
				alwaysMarkNsfw: false,
			});

			await this.internalEventService.emit('updateUserProfile', { userId: user.id, keys: ['alwaysMarkNsfw'] });

			await this.moderationLogService.log(me, 'unNsfwUser', {
				userId: ps.userId,
				userUsername: user.username,
				userHost: user.host,
			});
		});
	}
}
