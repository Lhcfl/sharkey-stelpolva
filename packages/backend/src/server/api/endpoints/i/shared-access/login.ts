/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { AccessTokensRepository } from '@/models/_.js';
import { ApiError } from '@/server/api/error.js';
import { NotificationService } from '@/core/NotificationService.js';

export const meta = {
	requireCredential: true,
	secure: true,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			userId: {
				type: 'string',
				optional: false, nullable: false,
			},
			token: {
				type: 'string',
				optional: false, nullable: false,
			},
		},
	},

	errors: {
		noSuchAccess: {
			message: 'No such access',
			code: 'NO_SUCH_ACCESS',
			id: 'd536e0f2-47fc-4d66-843c-f9276e98030f',
			httpStatusCode: 403,
		},
	},

	// 2 calls per second
	limit: {
		duration: 1000,
		max: 2,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		grantId: { type: 'string' },
	},
	required: ['grantId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.accessTokensRepository)
		private readonly accessTokensRepository: AccessTokensRepository,

		private readonly notificationService: NotificationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const token = await this.accessTokensRepository.findOneBy({ id: ps.grantId });

			if (!token) {
				throw new ApiError(meta.errors.noSuchAccess);
			}

			if (!token.granteeIds.includes(me.id)) {
				throw new ApiError(meta.errors.noSuchAccess);
			}

			this.notificationService.createNotification(token.userId, 'sharedAccessLogin', {}, me.id);

			return {
				token: token.token,
				userId: token.userId,
			};
		});
	}
}
