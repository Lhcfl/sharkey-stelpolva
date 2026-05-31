/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { WebAuthnService } from '@/core/WebAuthnService.js';
import { ApiError } from '@/server/api/error.js';
import { UserAuthService } from '@/core/UserAuthService.js';

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
			id: '38769596-efe2-4faf-9bec-abbb3f2cd9ba',
		},

		incorrectTotp: {
			message: 'Incorrect 2FA code.',
			code: 'INCORRECT_TOTP',
			id: 'cdf1235b-ac71-46d4-a3a6-84ccce48df6f',
		},

		twoFactorNotEnabled: {
			message: '2fa not enabled.',
			code: 'TWO_FACTOR_NOT_ENABLED',
			id: 'bf32b864-449b-47b8-974e-f9a5468546f1',
		},
	},

	res: {
		type: 'object',
		nullable: false,
		optional: false,
		properties: {
			rp: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						optional: true,
					},
				},
			},
			user: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
					},
					name: {
						type: 'string',
					},
					displayName: {
						type: 'string',
					},
				},
			},
			challenge: {
				type: 'string',
			},
			pubKeyCredParams: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						type: {
							type: 'string',
						},
						alg: {
							type: 'number',
						},
					},
				},
			},
			timeout: {
				type: 'number',
				nullable: true,
			},
			excludeCredentials: {
				type: 'array',
				nullable: true,
				items: {
					type: 'object',
					properties: {
						id: {
							type: 'string',
						},
						type: {
							type: 'string',
						},
						transports: {
							type: 'array',
							items: {
								type: 'string',
								enum: [
									'ble',
									'cable',
									'hybrid',
									'internal',
									'nfc',
									'smart-card',
									'usb',
								],
							},
						},
					},
				},
			},
			authenticatorSelection: {
				type: 'object',
				nullable: true,
				properties: {
					authenticatorAttachment: {
						type: 'string',
						enum: [
							'cross-platform',
							'platform',
						],
					},
					requireResidentKey: {
						type: 'boolean',
					},
					userVerification: {
						type: 'string',
						enum: [
							'discouraged',
							'preferred',
							'required',
						],
					},
				},
			},
			attestation: {
				type: 'string',
				nullable: true,
				enum: [
					'direct',
					'enterprise',
					'indirect',
					'none',
					null,
				],
			},
			extensions: {
				type: 'object',
				nullable: true,
				properties: {
					appid: {
						type: 'string',
						nullable: true,
					},
					credProps: {
						type: 'boolean',
						nullable: true,
					},
					hmacCreateSecret: {
						type: 'boolean',
						nullable: true,
					},
				},
			},
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

// eslint-disable-next-line import/no-default-export
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private webAuthnService: WebAuthnService,
		private userAuthService: UserAuthService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: me.id });

			if (!profile.twoFactorEnabled) {
				throw new ApiError(meta.errors.twoFactorNotEnabled);
			}

			if (!await this.userAuthService.checkPassword(profile, ps.password)) {
				throw new ApiError(meta.errors.incorrectPassword);
			}

			if (!await this.userAuthService.check2FA(profile, ps.token)) {
				throw new ApiError(meta.errors.incorrectTotp);
			}

			return await this.webAuthnService.initiateRegistration(
				me.id,
				me.username,
				me.name ?? undefined,
			);
		});
	}
}
