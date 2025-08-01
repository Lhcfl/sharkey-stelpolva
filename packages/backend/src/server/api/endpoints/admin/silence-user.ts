/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { CacheService } from '@/core/CacheService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:silence-user',
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
		@Inject(DI.usersRepository)
		private readonly usersRepository: UsersRepository,
		private readonly cacheService: CacheService,
		private readonly moderationLogService: ModerationLogService,
		private readonly roleService: RoleService,
		private readonly globalEventService: GlobalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.cacheService.findUserById(ps.userId);

			if (await this.roleService.isModerator(user)) {
				throw new Error('cannot silence moderator account');
			}

			if (user.isSilenced) return;

			await this.usersRepository.update(user.id, {
				isSilenced: true,
			});

			this.globalEventService.publishInternalEvent(user.host == null ? 'localUserUpdated' : 'remoteUserUpdated', {
				id: user.id,
			});

			await this.moderationLogService.log(me, 'silenceUser', {
				userId: ps.userId,
				userUsername: user.username,
				userHost: user.host,
			});
		});
	}
}
