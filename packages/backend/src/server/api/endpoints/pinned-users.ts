/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IsNull } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta, UsersRepository } from '@/models/_.js';
import * as Acct from '@/misc/acct.js';
import type { MiUser } from '@/models/User.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { CacheService } from '@/core/CacheService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['users'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'User',
		},
	},

	// 2 calls per second
	limit: {
		duration: 1000,
		max: 2,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		detail: {
			type: 'boolean',
			nullable: false,
			default: true,
		},
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private userEntityService: UserEntityService,
		private readonly cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const pinnedAccts = this.serverSettings.pinnedUsers.map(acct => acct.toLowerCase());
			const pinnedUserIds = await this.cacheService.userByAcctCache.fetchMany(pinnedAccts);
			const pinnedUsers = await this.cacheService.userByIdCache.fetchMany(pinnedUserIds.values);

			return await this.userEntityService.packMany(pinnedUsers.values, me, { schema: ps.detail ? 'UserDetailed' : 'UserLite' });
		});
	}
}
