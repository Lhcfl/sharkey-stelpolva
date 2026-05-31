/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import type { UserProfilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
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
			id: '78d6c839-20c9-4c66-b90a-fc0542168b48',
		},

		incorrectTotp: {
			message: 'Incorrect 2FA code.',
			code: 'INCORRECT_TOTP',
			id: 'cdf1235b-ac71-46d4-a3a6-84ccce48df6f',
		},
	},

	res: {
		type: 'object',
		nullable: false,
		optional: false,
		properties: {
			qr: { type: 'string' },
			url: { type: 'string' },
			secret: { type: 'string' },
			label: { type: 'string' },
			issuer: { type: 'string' },
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
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private userAuthService: UserAuthService,
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

			// Generate user's secret key
			const secret = new OTPAuth.Secret();

			await this.userProfilesRepository.update(me.id, {
				twoFactorTempSecret: secret.base32,
			});
			await this.internalEventService.emit('updateUserProfile', { userId: me.id, keys: ['twoFactorTempSecret'] });

			// Get the data URL of the authenticator URL
			const totp = new OTPAuth.TOTP({
				secret,
				digits: 6,
				label: me.username,
				issuer: this.config.host,
			});
			const url = totp.toString();
			const qr = await QRCode.toDataURL(url);

			return {
				qr,
				url,
				secret: secret.base32,
				label: me.username,
				issuer: this.config.host,
			};
		});
	}
}
