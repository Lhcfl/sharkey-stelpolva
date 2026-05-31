/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UserProfilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { TimeService } from '@/global/TimeService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { CacheService } from '@/core/CacheService.js';
import { trackTask } from '@/misc/promise-tracker.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../error.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'MeDetailed',
	},

	errors: {
		userIsDeleted: {
			message: 'User is deleted.',
			code: 'USER_IS_DELETED',
			id: 'e5b3b9f0-2b8f-4b9f-9c1f-8c5c1b2e1b1a',
			kind: 'permission',
		},
	},

	// up to 20 calls, then 1 per second.
	// This handles bursty traffic when all tabs reload as a group
	limit: {
		type: 'bucket',
		size: 20,
		dripSize: 1,
		dripRate: 1000,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private userEntityService: UserEntityService,
		private readonly timeService: TimeService,
		private readonly cacheService: CacheService,
		private readonly internalEventService: InternalEventService,
	) {
		super(meta, paramDef, async (ps, me, token) => {
			const isSecure = token == null;

			const now = this.timeService.date;
			const [today] = now.toISOString().match(/^\d\d\d\d-\d\d-\d\d/) ?? [];

			const userProfile = await this.cacheService.userProfileCache.fetchMaybe(me.id);
			if (userProfile == null) {
				throw new ApiError(meta.errors.userIsDeleted);
			}

			// "today" should always be defined, but check just in case.
			if (today && !userProfile.loggedInDates.includes(today)) {
				userProfile.loggedInDates = [...userProfile.loggedInDates, today];

				// Run this asynchronously because /i needs to be fast
				trackTask(async () => {
					// TODO this field should really just be a table...
					await this.userProfilesRepository.update({ userId: me.id }, {
						loggedInDates: userProfile.loggedInDates,
					});
					await this.internalEventService.emit('updateUserProfile', { userId: me.id, keys: ['loggedInDates'] });
				});
			}

			return await this.userEntityService.pack(me, me, {
				schema: 'MeDetailed',
				includeSecrets: isSecure,
				hint: { userProfile },
			});
		});
	}
}
