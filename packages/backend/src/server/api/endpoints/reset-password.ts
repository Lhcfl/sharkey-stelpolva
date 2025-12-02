/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as argon2 from 'argon2';
import { Inject, Injectable } from '@nestjs/common';
import type { UserProfilesRepository, PasswordResetRequestsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { TimeService } from '@/global/TimeService.js';

export const meta = {
	tags: ['reset password'],

	requireCredential: false,

	description: 'Complete the password reset that was previously requested.',

	errors: {

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
		password: { type: 'string' },
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
	) {
		super(meta, paramDef, async (ps, me) => {
			const req = await this.passwordResetRequestsRepository.findOneByOrFail({
				token: ps.token,
			});

			// 発行してから30分以上経過していたら無効
			if (this.timeService.now - this.idService.parse(req.id).date.getTime() > 1000 * 60 * 30) {
				throw new Error(); // TODO
			}

			// Generate hash of password
			const hash = await argon2.hash(ps.password);

			await this.userProfilesRepository.update(req.userId, {
				password: hash,
			});

			await this.passwordResetRequestsRepository.delete(req.id);
		});
	}
}
