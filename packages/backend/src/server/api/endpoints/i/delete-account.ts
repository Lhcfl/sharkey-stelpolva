/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type { IEndpointMeta } from '@/server/api/endpoints.js';
import type { Schema } from '@/misc/json-schema.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';
import { UserAuthService } from '@/core/UserAuthService.js';
import { errorCodes, isIdentifiableError } from '@/misc/identifiable-error.js';
import { CacheService } from '@/core/CacheService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	requireCredential: true,

	// Up to 10, then 1 per 6 minutes (10/hour)
	limit: {
		type: 'bucket',
		size: 10,
		dripRate: 6 * 60 * 1000,
	},

	secure: true,

	errors: {
		incorrectPassword: {
			message: 'Incorrect password.',
			code: 'INCORRECT_PASSWORD',
			id: '7add0395-9901-4098-82f9-4f67af65f775',
		},

		incorrectTotp: {
			message: 'Incorrect 2FA code.',
			code: 'INCORRECT_TOTP',
			id: 'cdf1235b-ac71-46d4-a3a6-84ccce48df6f',
		},

		userProtected: {
			message: errorCodes.userProtected,
			code: 'USER_PROTECTED',
			id: 'b5983a6a-9930-4c06-966b-d1cac0054544',
		},
	},
} as const satisfies IEndpointMeta;

export const paramDef = {
	type: 'object',
	properties: {
		password: { type: 'string' },
		token: { type: 'string', nullable: true },
	},
	required: ['password'],
} as const satisfies Schema;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private readonly userAuthService: UserAuthService,
		private readonly deleteAccountService: DeleteAccountService,
		private readonly cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const profile = await this.cacheService.userProfileCache.fetch(me.id);

			if (!await this.userAuthService.checkPassword(profile, ps.password)) {
				throw new ApiError(meta.errors.incorrectPassword);
			}

			if (!await this.userAuthService.check2FA(profile, ps.token)) {
				throw new ApiError(meta.errors.incorrectTotp);
			}

			try {
				await this.deleteAccountService.deleteAccount(me);
			} catch (err) {
				if (isIdentifiableError(err, errorCodes.userProtected)) throw new ApiError(meta.errors.userProtected);
				throw err;
			}
		});
	}
}
