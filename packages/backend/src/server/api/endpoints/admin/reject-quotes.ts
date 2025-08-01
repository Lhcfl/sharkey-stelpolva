/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { CacheService } from '@/core/CacheService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:reject-quotes',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		rejectQuotes: { type: 'boolean', nullable: false },
	},
	required: ['userId', 'rejectQuotes'],
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

			// Skip if there's nothing to do
			if (user.rejectQuotes === ps.rejectQuotes) return;

			await this.usersRepository.update(ps.userId, {
				rejectQuotes: ps.rejectQuotes,
			});

			// Synchronize caches and other processes
			this.globalEventService.publishInternalEvent('localUserUpdated', { id: ps.userId });

			await this.moderationLogService.log(me, ps.rejectQuotes ? 'rejectQuotesUser' : 'acceptQuotesUser', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
			});
		});
	}
}
