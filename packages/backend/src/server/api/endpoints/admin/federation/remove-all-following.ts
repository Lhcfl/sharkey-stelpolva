/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { FollowingsRepository, UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { QueueService } from '@/core/QueueService.js';
import { CacheService } from '@/core/CacheService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:federation',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		host: { type: 'string' },
	},
	required: ['host'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private queueService: QueueService,
		private readonly moderationLogService: ModerationLogService,
		private readonly cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const followings = await this.followingsRepository.findBy([
				{
					followeeHost: ps.host,
				},
				{
					followerHost: ps.host,
				},
			]);

			const userIds = followings.flatMap(f => [f.followerId, f.followeeId]);
			const users = await this.cacheService.findUsersById(userIds);
			const pairs = followings
				.map(f => {
					const from = users.get(f.followerId);
					const to = users.get(f.followeeId);
					if (!from || !to) {
						return null;
					}

					return [{ id: from.id }, { id: to.id }];
				})
				.filter(pair => pair != null);

			await this.moderationLogService.log(me, 'severFollowRelations', {
				host: ps.host,
			});

			await this.queueService.createUnfollowJob(pairs.map(p => ({ from: p[0], to: p[1], silent: true })));
		});
	}
}
