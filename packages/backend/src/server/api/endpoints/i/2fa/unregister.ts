/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { UserAuthService } from '@/core/UserAuthService.js';
import { InternalEventService } from '@/global/InternalEventService.js';

export const meta = {
	requireCredential: true,

	secure: true,

	limit: {
		duration: ms('1hour'),
		max: 10,
		minInterval: ms('1sec'),
	},

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
		password: { type: 'string' },
		token: { type: 'string', nullable: true },
	},
	required: ['password'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private userEntityService: UserEntityService,
		private userAuthService: UserAuthService,
		private globalEventService: GlobalEventService,
		private readonly internalEventService: InternalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: me.id });

			if (!await this.userAuthService.checkPassword(profile, ps.password)) {
				throw new ApiError(meta.errors.incorrectPassword);
			}

			if (!await this.userAuthService.check2FA(profile, ps.token)) {
				throw new ApiError(meta.errors.incorrectTotp);
			}

			await this.userProfilesRepository.update(me.id, {
				twoFactorSecret: null,
				twoFactorBackupSecret: null,
				twoFactorEnabled: false,
				usePasswordLessLogin: false,
			});
			await this.internalEventService.emit('updateUserProfile', { userId: me.id, keys: ['twoFactorSecret', 'twoFactorBackupSecret', 'twoFactorEnabled', 'usePasswordLessLogin'] });

			// Publish meUpdated event
			await this.globalEventService.publishMainStream(me.id, 'meUpdated', await this.userEntityService.pack(me.id, me, {
				schema: 'MeDetailed',
				includeSecrets: true,
			}));
		});
	}
}
