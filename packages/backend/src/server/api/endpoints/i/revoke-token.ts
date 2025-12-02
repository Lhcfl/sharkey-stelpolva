/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AccessTokensRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { NotificationService } from '@/core/NotificationService.js';

export const meta = {
	requireCredential: true,

	secure: true,

	// 10 calls per 5 seconds
	limit: {
		duration: 1000 * 5,
		max: 10,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		tokenId: { type: 'string', format: 'misskey:id' },
		token: { type: 'string', nullable: true },
	},
	anyOf: [
		{ required: ['tokenId'] },
		{ required: ['token'] },
	],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.accessTokensRepository)
		private accessTokensRepository: AccessTokensRepository,

		private readonly notificationService: NotificationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.tokenId) {
				const tokenExist = await this.accessTokensRepository.findOne({ where: { id: ps.tokenId } });

				if (tokenExist) {
					for (const granteeId of tokenExist.granteeIds) {
						this.notificationService.createNotification(granteeId, 'sharedAccessRevoked', {}, me.id);
					}

					await this.accessTokensRepository.delete({
						id: ps.tokenId,
						userId: me.id,
					});
				}
			} else if (ps.token) {
				const tokenExist = await this.accessTokensRepository.findOne({ where: { token: ps.token } });

				if (tokenExist) {
					for (const granteeId of tokenExist.granteeIds) {
						this.notificationService.createNotification(granteeId, 'sharedAccessRevoked', {}, me.id);
					}

					await this.accessTokensRepository.delete({
						token: ps.token,
						userId: me.id,
					});
				}
			}
		});
	}
}
