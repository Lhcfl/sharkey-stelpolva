/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { MiFollowing } from '@/models/_.js';
import type { MiUser, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { TimeService } from '@/global/TimeService.js';
import { promiseMap } from '@/misc/promise-map.js';
import type { SelectQueryBuilder } from 'typeorm';

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

	// 20 calls, then 4 per second
	limit: {
		type: 'bucket',
		size: 20,
		dripRate: 250,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
		sort: { type: 'string', enum: ['+follower', '-follower', '+localFollower', '-localFollower', '+createdAt', '-createdAt', '+updatedAt', '-updatedAt'] },
		state: { type: 'string', enum: ['all', 'alive'], default: 'all' },
		origin: { type: 'string', enum: ['combined', 'local', 'remote'], default: 'local' },
		hostname: {
			type: 'string',
			nullable: true,
			default: null,
			description: 'The local host is represented with `null`.',
		},
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
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private userEntityService: UserEntityService,
		private queryService: QueryService,
		private readonly roleService: RoleService,
		private readonly timeService: TimeService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.usersRepository.createQueryBuilder('user')
				.where('user.isExplorable = TRUE')
				.andWhere('user.isSuspended = FALSE');

			switch (ps.state) {
				case 'alive': query.andWhere('user.updatedAt > :date', { date: new Date(this.timeService.now - 1000 * 60 * 60 * 24 * 5) }); break;
			}

			switch (ps.origin) {
				case 'local': query.andWhere('user.host IS NULL'); break;
				case 'remote': query.andWhere('user.host IS NOT NULL'); break;
			}

			if (ps.hostname) {
				query.andWhere('user.host = :hostname', { hostname: ps.hostname.toLowerCase() });
			}

			switch (ps.sort) {
				case '+follower': query.orderBy('user.followersCount', 'DESC'); break;
				case '-follower': query.orderBy('user.followersCount', 'ASC'); break;
				case '+localFollower': this.addLocalFollowers(query); query.orderBy('f."localFollowers"', 'DESC'); break;
				case '-localFollower': this.addLocalFollowers(query); query.orderBy('f."localFollowers"', 'ASC'); break;
				case '+createdAt': query.orderBy('user.id', 'DESC'); break;
				case '-createdAt': query.orderBy('user.id', 'ASC'); break;
				case '+updatedAt': query.andWhere('user.updatedAt IS NOT NULL').orderBy('user.updatedAt', 'DESC'); break;
				case '-updatedAt': query.andWhere('user.updatedAt IS NOT NULL').orderBy('user.updatedAt', 'ASC'); break;
				default: query.orderBy('user.id', 'ASC'); break;
			}

			if (me) this.queryService.generateMutedUserQueryForUsers(query, me);
			if (me) this.queryService.generateBlockQueryForUsers(query, me);

			query.limit(ps.limit);
			query.offset(ps.offset);

			const allUsers = await query.getMany();

			// This is not ideal, for a couple of reasons:
			// 1. It may return less than "limit" results.
			// 2. A span of more than "limit" consecutive non-trendable users may cause the pagination to stop early.
			// Unfortunately, there's no better solution unless we refactor role policies to be persisted to the DB.
			const usersWithRoles = await promiseMap(allUsers, async u => [u, await this.roleService.getUserPolicies(u)] as const, { limit: 4 });
			const users = usersWithRoles
				.filter(([,p]) => p.canTrend)
				.map(([u]) => u);

			return await this.userEntityService.packMany(users, me, { schema: ps.detail ? 'UserDetailed' : 'UserLite' });
		});
	}

	private addLocalFollowers(query: SelectQueryBuilder<MiUser>) {
		query.innerJoin(qb => {
			return qb
				.from(MiFollowing, 'f')
				.addSelect('f."followeeId"')
				.addSelect('COUNT(*) FILTER (where f."followerHost" IS NULL)', 'localFollowers')
				.addSelect('COUNT(*) FILTER (where f."followeeHost" IS NOT NULL)', 'remoteFollowers')
				.groupBy('"followeeId"');
		}, 'f', 'user.id = f."followeeId"');
	}
}
