/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { UsedUsernamesRepository } from '@/models/_.js';
import type { IEndpointMeta } from '@/server/api/endpoints.js';
import type { Schema } from '@/misc/json-schema.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { DI } from '@/di-symbols.js';
import { EmailService } from '@/core/EmailService.js';
import { DeleteAccountService } from '@/core/DeleteAccountService.js';
import { CacheService } from '@/core/CacheService.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import { isIdentifiableError, errorCodes } from '@/misc/identifiable-error.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:decline-user',

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

		userNotLocal: {
			message: errorCodes.userNotLocal,
			code: 'USER_NOT_LOCAL',
			id: '46b31d0a-1f46-4292-aa73-955f5a083897',
		},

		userIsSuspended: {
			message: errorCodes.userSuspended,
			code: 'USER_IS_SUSPENDED',
			id: '07e7d267-8a14-49fe-a196-92e619bac99a',
		},

		userIsApproved: {
			message: 'User is already approved.',
			code: 'USER_IS_APPROVED',
			id: 'edfd58b3-d7af-4da5-aab3-ed1a9dbc5172',
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
		@Inject(DI.usedUsernamesRepository)
		private readonly usedUsernamesRepository: UsedUsernamesRepository,

		private readonly moderationLogService: ModerationLogService,
		private readonly emailService: EmailService,
		private readonly deleteAccountService: DeleteAccountService,
		private readonly cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const [user, profile] = await Promise.all([
				this.cacheService.findOptionalUserById(ps.userId),
				this.cacheService.userProfileCache.fetchMaybe(ps.userId),
			]);

			if (user == null || user.isDeleted) throw new ApiError(meta.errors.noSuchUser);
			if (user.host != null) throw new ApiError(meta.errors.userNotLocal);
			if (user.isSuspended) throw new ApiError(meta.errors.userIsSuspended);
			if (user.approved) throw new ApiError(meta.errors.userIsApproved);

			if (profile?.email) {
				// TODO email should really be handled by a job so we can retry
				trackPromise(this.emailService.sendEmail(profile.email, 'Account Declined',
					'Your Account has been declined!',
					'Your Account has been declined!'));
			}

			try {
				await this.deleteAccountService.deleteAccount(user, me);
			} catch (err) {
				if (isIdentifiableError(err, errorCodes.userProtected)) throw new ApiError(meta.errors.userProtected);
				throw err;
			}

			await this.usedUsernamesRepository.createQueryBuilder('uu')
				.delete()
				.where('lower(uu.username) = :username', { username: user.username.toLowerCase() })
				.execute();

			await this.moderationLogService.log(me, 'decline', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
			});
		});
	}
}
