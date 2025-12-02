/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { CacheService } from '@/core/CacheService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:cw-user',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		cw: { type: 'string', nullable: true },
	},
	required: ['userId', 'cw'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private readonly usersRepository: UsersRepository,

		private readonly globalEventService: GlobalEventService,
		private readonly cacheService: CacheService,
		private readonly moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const user = await this.cacheService.findUserById(ps.userId);

			// Collapse empty strings to null
			const newCW = ps.cw?.trim() || null;
			const oldCW = user.mandatoryCW;

			// Skip if there's nothing to do
			if (oldCW === newCW) return;

			await this.usersRepository.update(ps.userId, { mandatoryCW: newCW });

			// Synchronize caches and other processes
			const evt = user.host == null ? 'localUserUpdated' : 'remoteUserUpdated';
			this.globalEventService.publishInternalEvent(evt, { id: ps.userId });

			await this.moderationLogService.log(me, 'setMandatoryCW', {
				newCW,
				oldCW,
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
			});

			return {};
		});
	}
}
