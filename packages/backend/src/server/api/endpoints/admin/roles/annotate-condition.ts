/*
 * SPDX-FileCopyrightText: bunnybeam and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { RoleService } from '@/core/RoleService.js';
import { CacheService } from '@/core/CacheService.js';

export const meta = {
	tags: ['admin', 'role'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:roles',

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '34550050-3115-4443-b389-ce3e62eb9857',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		additionalProperties: { type: 'boolean' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		condFormula: { type: 'object' },
	},
	required: [
		'userId',
		'condFormula',
	],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private roleService: RoleService,
		private cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });
			if (user === null) {
				throw new ApiError(meta.errors.noSuchUser);
			}
			const followStats = await this.cacheService.getFollowStats(ps.userId);
			const roles = await this.roleService.getUserRoles(ps.userId);

			const results: { [k: string]: boolean } = {};
			roleService.annotateCond(user, roles, ps.condFormula, followStats, results);
			return results;
		});
	}
}

