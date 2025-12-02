/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { AccessTokensRepository } from '@/models/_.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { QueryService } from '@/core/QueryService.js';

export const meta = {
	requireCredential: true,
	secure: true,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: {
					type: 'string',
					optional: false, nullable: false,
				},
				user: {
					ref: 'UserLite',
					optional: false, nullable: false,
				},
				permissions: {
					type: 'array',
					optional: false, nullable: false,
					items: {
						type: 'string',
						optional: false, nullable: false,
					},
				},
				rank: {
					type: 'string',
					enum: ['admin', 'mod', 'user'],
					optional: false, nullable: true,
				},
			},
		},
		properties: {
			userId: {
				type: 'string',
				optional: false, nullable: false,
			},
			token: {
				type: 'string',
				optional: false, nullable: false,
			},
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
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.accessTokensRepository)
		private readonly accessTokensRepository: AccessTokensRepository,

		private readonly userEntityService: UserEntityService,
		private readonly queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const tokens = await this.queryService.makePaginationQuery(this.accessTokensRepository.createQueryBuilder('token'), ps.sinceId, ps.untilId)
				.where(':meIdAsList <@ token.granteeIds', { meIdAsList: [me.id] })
				.limit(ps.limit)
				.getMany();

			const userIds = tokens.map(token => token.userId);
			const packedUsers = await this.userEntityService.packMany(userIds, me);
			const packedUserMap = new Map(packedUsers.map(u => [u.id, u]));

			return tokens.map(token => ({
				id: token.id,
				permissions: token.permission,
				user: packedUserMap.get(token.userId),
				rank: token.rank,
			}));
		});
	}
}
