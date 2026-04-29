/*
 * SPDX-FileCopyrightText: dakkar and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { CacheService } from '@/core/CacheService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { MetaService } from '@/core/MetaService.js';
import { MiMeta } from '@/models/_.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'],

	secure: true, // only accept calls from our own frontend
	requireCredential: true,
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
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private metaService: MetaService,
		private readonly cacheService: CacheService,
		private readonly moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (this.serverSettings.rootUserId !== me.id) {
				throw new ApiError({
					message: 'You are not the root user.',
					code: 'ROLE_PERMISSION_DENIED',
					kind: 'permission',
					id: '77345d78-10ba-44a8-bddd-113de2a82b33',
				});
			}

			const oldRootUserId = this.serverSettings.rootUserId;
			const newRootUser = await this.cacheService.findUserById(ps.userId);
			const oldRootUser = await this.cacheService.findUserById(oldRootUserId);

			await this.metaService.update({ rootUserId: ps.userId });

			this.moderationLogService.log(me, 'setRoot', {
				before: { userId: oldRootUserId, userUsername: oldRootUser.username },
				after: { userId: ps.userId, userUsername: newRootUser.username },
			});
		});
	}
}
