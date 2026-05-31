/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UserProfilesRepository, PasswordResetRequestsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { TimeService } from '@/global/TimeService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { UserAuthService } from '@/core/UserAuthService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['reset password'],

	requireCredential: false,

	description: 'Complete the password reset that was previously requested.',

	errors: {
		resetTokenExpired: {
			id: '1d0d3ec1-5ebe-4bdd-9edd-0a82eb0ec398',
			code: 'RESET_TOKEN_EXPIRED',
			message: 'Password reset token has expired.',
		},
	},

	// 2 calls per 30 minutes
	limit: {
		duration: 1000 * 60 * 30,
		max: 2,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		token: { type: 'string' },
		password: { type: 'string', minLength: 1 },
	},
	required: ['token', 'password'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.passwordResetRequestsRepository)
		private passwordResetRequestsRepository: PasswordResetRequestsRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private idService: IdService,
		private readonly timeService: TimeService,
		private readonly internalEventService: InternalEventService,
		private readonly userAuthService: UserAuthService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const req = await this.passwordResetRequestsRepository.findOneByOrFail({
				token: ps.token,
			});

			// 発行してから30分以上経過していたら無効
			if (this.timeService.now - this.idService.parse(req.id).date.getTime() > 1000 * 60 * 30) {
				throw new ApiError(meta.errors.resetTokenExpired);
			}

			// Generate hash of password
			const hash = await this.userAuthService.hashPassword(ps.password);

			await this.userProfilesRepository.update(req.userId, {
				password: hash,
			});
			await this.internalEventService.emit('updateUserProfile', { userId: req.userId, keys: ['password'] });

			await this.passwordResetRequestsRepository.delete(req.id);
		});
	}
}
