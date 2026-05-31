/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { UserAuthService } from '@/core/UserAuthService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	requireCredential: true,

	limit: {
		duration: ms('1hour'),
		max: 10,
		minInterval: ms('1sec'),
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
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		currentPassword: { type: 'string' },
		newPassword: { type: 'string', minLength: 1 },
		token: { type: 'string', nullable: true },
	},
	required: ['currentPassword', 'newPassword'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private userAuthService: UserAuthService,
		private readonly internalEventService: InternalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: me.id });

			if (!await this.userAuthService.checkPassword(profile, ps.currentPassword)) {
				throw new ApiError(meta.errors.incorrectPassword);
			}

			if (!await this.userAuthService.check2FA(profile, ps.token)) {
				throw new ApiError(meta.errors.incorrectTotp);
			}

			// Generate hash of password
			const hash = await this.userAuthService.hashPassword(ps.newPassword);

			await this.userProfilesRepository.update(me.id, {
				password: hash,
			});
			await this.internalEventService.emit('updateUserProfile', { userId: me.id, keys: ['password'] });
		});
	}
}
