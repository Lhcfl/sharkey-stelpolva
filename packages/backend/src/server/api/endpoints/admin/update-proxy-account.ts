/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import {
	descriptionSchema,
} from '@/models/User.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { CacheService } from '@/core/CacheService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:account',

	res: {
		type: 'object',
		nullable: false, optional: false,
		ref: 'UserDetailed',
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		description: { ...descriptionSchema, nullable: true },
	},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private userEntityService: UserEntityService,
		private moderationLogService: ModerationLogService,
		private systemAccountService: SystemAccountService,
		private readonly cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const beforeUser = await this.systemAccountService.getProxyActor();
			const beforeProfile = await this.cacheService.userProfileCache.fetch(beforeUser.id);

			const proxy = await this.systemAccountService.updateCorrespondingUserProfile('proxy', {
				description: ps.description,
			});

			if (ps.description !== undefined) {
				await this.moderationLogService.log(me, 'updateProxyAccountDescription', {
					before: beforeProfile.description,
					after: ps.description,
				});
			}

			return await this.userEntityService.pack(proxy, me, {
				schema: 'MeDetailed',
			});
		});
	}
}
