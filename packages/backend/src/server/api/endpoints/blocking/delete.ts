/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository, BlockingsRepository, MutingsRepository } from '@/models/_.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { UserMutingService } from '@/core/UserMutingService.js';
import { CacheService } from '@/core/CacheService.js';
import { DI } from '@/di-symbols.js';
import { GetterService } from '@/server/api/GetterService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['account'],

	limit: {
		duration: ms('1hour'),
		max: 100,
	},

	requireCredential: true,

	kind: 'write:blocks',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '8621d8bf-c358-4303-a066-5ea78610eb3f',
		},

		blockeeIsYourself: {
			message: 'Blockee is yourself.',
			code: 'BLOCKEE_IS_YOURSELF',
			id: '06f6fac6-524b-473c-a354-e97a40ae6eac',
		},

		notBlocking: {
			message: 'You are not blocking that user.',
			code: 'NOT_BLOCKING',
			id: '291b2efa-60c6-45c0-9f6a-045c8f9b02cd',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'UserDetailedNotMe',
	},
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
		private usersRepository: UsersRepository,

		@Inject(DI.blockingsRepository)
		private blockingsRepository: BlockingsRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		private userEntityService: UserEntityService,
		private getterService: GetterService,
		private userBlockingService: UserBlockingService,
		private userMutingService: UserMutingService,
		private readonly cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const blocker = me;

			// Check if the blockee is yourself
			if (me.id === ps.userId) {
				throw new ApiError(meta.errors.blockeeIsYourself);
			}

			// Get blockee
			const blockee = await this.cacheService.findOptionalUserById(ps.userId);
			if (blockee == null) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			// Check not blocking
			const relations = await this.cacheService.getUserRelation(blocker, blockee);
			if (!relations.isBlocking) {
				throw new ApiError(meta.errors.notBlocking);
			}

			// Delete blocking
			await Promise.all([
				this.userBlockingService.unblock(blocker, blockee),
				this.userMutingService.tryUnmute(blocker, blockee),
			]);

			return await this.userEntityService.pack(blockee, blocker, {
				schema: 'UserDetailedNotMe',
			});
		});
	}
}
