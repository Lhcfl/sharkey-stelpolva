/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { CacheService } from '@/core/CacheService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { AccountMoveService } from '@/core/AccountMoveService.js';
import { ApiError } from '@/server/api/error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:restart-migration',

	errors: {
		accountHasNotMigrated: {
			message: 'Account has not migrated anywhere.',
			code: 'ACCOUNT_HAS_NOT_MIGRATED',
			id: 'ddcf173a-00f2-4aa4-ba12-cddd131bacf4',
		},
	},

	res: {},
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
		private readonly cacheService: CacheService,
		private readonly moderationLogService: ModerationLogService,
		private readonly accountMoveService: AccountMoveService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const user = await this.cacheService.findUserById(ps.userId);
				await this.accountMoveService.restartMigration(user);

				await this.moderationLogService.log(me, 'restartMigration', {
					userId: user.id,
					userUsername: user.username,
					userHost: user.host,
				});
			} catch (err) {
				// TODO allow this mapping stuff to be defined in the meta
				if (err instanceof IdentifiableError && err.id === 'ddcf173a-00f2-4aa4-ba12-cddd131bacf4') {
					throw new ApiError(meta.errors.accountHasNotMigrated);
				} else {
					throw err;
				}
			}
		});
	}
}
