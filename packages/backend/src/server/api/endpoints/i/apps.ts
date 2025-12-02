/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AccessTokensRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { CacheService } from '@/core/CacheService.js';
import { QueryService } from '@/core/QueryService.js';

export const meta = {
	requireCredential: true,

	secure: true,

	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					optional: false,
					format: 'misskey:id',
				},
				name: {
					type: 'string',
					optional: true,
				},
				createdAt: {
					type: 'string',
					optional: false,
					format: 'date-time',
				},
				lastUsedAt: {
					type: 'string',
					optional: true,
					format: 'date-time',
				},
				permission: {
					type: 'array',
					optional: false,
					uniqueItems: true,
					items: {
						type: 'string',
					},
				},
				grantees: {
					type: 'array',
					optional: false,
					items: {
						ref: 'UserLite',
					},
				},
				rank: {
					type: 'string',
					optional: false,
					nullable: true,
					enum: ['admin', 'mod', 'user'],
				},
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
		sort: { type: 'string', enum: ['+createdAt', '-createdAt', '+lastUsedAt', '-lastUsedAt'] },
		onlySharedAccess: { type: 'boolean' },
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
		private accessTokensRepository: AccessTokensRepository,

		private readonly userEntityService: UserEntityService,
		private readonly cacheService: CacheService,
		private readonly queryService: QueryService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.queryService.makePaginationQuery(this.accessTokensRepository.createQueryBuilder('token'), ps.sinceId, ps.untilId)
				.where('token.userId = :userId', { userId: me.id })
				.limit(ps.limit)
				.leftJoinAndSelect('token.app', 'app');

			switch (ps.sort) {
				case '+createdAt': query.orderBy('token.id', 'DESC'); break;
				case '-createdAt': query.orderBy('token.id', 'ASC'); break;
				case '+lastUsedAt': query.orderBy('token.lastUsedAt', 'DESC'); break;
				case '-lastUsedAt': query.orderBy('token.lastUsedAt', 'ASC'); break;
				default: query.orderBy('token.id', 'ASC'); break;
			}

			if (ps.onlySharedAccess) {
				query.andWhere('token.granteeIds != \'{}\'');
			}

			const tokens = await query.getMany();

			const users = await this.cacheService.findUsersById(tokens.flatMap(token => token.granteeIds));
			const packedUsers = await this.userEntityService.packMany(Array.from(users.values()), me);
			const packedUserMap = new Map(packedUsers.map(u => [u.id, u]));

			return tokens.map(token => ({
				id: token.id,
				name: token.name ?? token.app?.name,
				createdAt: this.idService.parse(token.id).date.toISOString(),
				lastUsedAt: token.lastUsedAt?.toISOString(),
				permission: token.app ? token.app.permission : token.permission,
				rank: token.rank,
				grantees: token.granteeIds
					.map(id => packedUserMap.get(id))
					.filter(user => user != null),
			}));
		});
	}
}
