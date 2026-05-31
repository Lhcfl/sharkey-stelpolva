/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type { IEndpointMeta } from '@/server/api/endpoints.js';
import type { Schema } from '@/misc/json-schema.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';
import { errorCodes, isIdentifiableError } from '@/misc/identifiable-error.js';
import { CacheService } from '@/core/CacheService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:delete-account',

	errors: {
		userProtected: {
			message: errorCodes.userProtected,
			code: 'USER_PROTECTED',
			id: 'b5983a6a-9930-4c06-966b-d1cac0054544',
		},

		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'a89abd3d-f0bc-4cce-beb1-2f446f4f1e6a',
		},
	},
} as const satisfies IEndpointMeta;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const satisfies Schema;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private readonly deleteAccountService: DeleteAccountService,
		private readonly cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const user = await this.cacheService.findUserById(ps.userId);
				await this.deleteAccountService.deleteAccount(user, me);
			} catch (err) {
				if (isIdentifiableError(err, errorCodes.userProtected)) throw new ApiError(meta.errors.userProtected);
				if (isIdentifiableError(err, errorCodes.userDeleted)) throw new ApiError(meta.errors.noSuchUser);
				throw err;
			}
		});
	}
}
