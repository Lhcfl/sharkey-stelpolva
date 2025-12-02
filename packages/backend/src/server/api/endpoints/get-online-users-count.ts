/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IsNull, MoreThan } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import { USER_ONLINE_THRESHOLD } from '@/const.js';
import type { UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { TimeService } from '@/global/TimeService.js';
import { CacheManagementService, type ManagedMemorySingleCache } from '@/global/CacheManagementService.js';

export const meta = {
	tags: ['meta'],

	requireCredential: false,
	allowGet: true,
	cacheSec: 60 * 1,
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			count: {
				type: 'number',
				nullable: false, optional: false,
			},
			countAcrossNetwork: {
				type: 'number',
				nullable: false, optional: false,
			},
		},
	},

	// 20 calls, then 4 per second
	limit: {
		type: 'bucket',
		size: 20,
		dripRate: 250,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	private readonly cache: ManagedMemorySingleCache<{ count: number, countAcrossNetwork: number }>;

	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
		private readonly timeService: TimeService,

		cacheManagementService: CacheManagementService,
	) {
		super(meta, paramDef, async () => {
			return this.cache.fetch(async () => {
				const countAcrossNetwork = await this.usersRepository.countBy({
					lastActiveDate: MoreThan(new Date(this.timeService.now - USER_ONLINE_THRESHOLD)),
				});
				const count = await this.usersRepository.countBy({
					lastActiveDate: MoreThan(new Date(this.timeService.now - USER_ONLINE_THRESHOLD)),
					host: IsNull(),
				});

				return {
					count,
					countAcrossNetwork,
				};
			});
		});

		this.cache = cacheManagementService.createMemorySingleCache<{ count: number, countAcrossNetwork: number }>('onlineUsers', { lifetime: 1000 * 60 }); // 1 minute
	}
}
