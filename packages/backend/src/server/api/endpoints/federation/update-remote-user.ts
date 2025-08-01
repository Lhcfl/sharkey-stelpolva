/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import { GetterService } from '@/server/api/GetterService.js';
import { CacheService } from '@/core/CacheService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['federation'],

	requireCredential: false,

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '558ea170-f653-4700-94d0-5a818371d0df',
		},
	},

	// Up to 10 calls, then 4 / second.
	// This allows for reliable automation.
	limit: {
		type: 'bucket',
		size: 10,
		dripRate: 250,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private getterService: GetterService,
		private apPersonService: ApPersonService,
		private readonly cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps) => {
			const user = await this.cacheService.findRemoteUserById(ps.userId);

			if (!user) {
				throw new ApiError(meta.errors.noSuchUser);
			}

			await this.apPersonService.updatePerson(user.uri!);
		});
	}
}
