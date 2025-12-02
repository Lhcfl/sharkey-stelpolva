/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { CacheService } from '@/core/CacheService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:user-note',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		text: { type: 'string' },
	},
	required: ['userId', 'text'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,
		private readonly internalEventService: InternalEventService,
		private readonly cacheService: CacheService,

		private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const [user, currentProfile] = await Promise.all([
				this.cacheService.findUserById(ps.userId),
				this.cacheService.userProfileCache.fetch(ps.userId),
			]);

			await this.userProfilesRepository.update({ userId: user.id }, {
				moderationNote: ps.text,
			});
			await this.internalEventService.emit('updateUserProfile', { userId: user.id });

			await this.moderationLogService.log(me, 'updateUserNote', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
				before: currentProfile.moderationNote,
				after: ps.text,
			});
		});
	}
}
