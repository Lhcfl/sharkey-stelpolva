/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AppsRepository } from '@/models/_.js';
import { AppEntityService } from '@/core/entities/AppEntityService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['app'],

	errors: {
		credentialRequired: {
			message: 'Credential required.',
			code: 'CREDENTIAL_REQUIRED',
			id: '1384574d-a912-4b81-8601-c7b1c4085df1',
			httpStatusCode: 401,
		},
		noAppLogin: {
			message: 'Not logged in with an app.',
			code: 'NO_APP_LOGIN',
			id: '339a4ad2-48c3-47fc-bd9d-2408f05120f8',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'App',
	},

	// 10 calls per 5 seconds
	limit: {
		duration: 1000 * 5,
		max: 10,
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
		@Inject(DI.appsRepository)
		private appsRepository: AppsRepository,

		private appEntityService: AppEntityService,
	) {
		super(meta, paramDef, async (_, user, token) => {
			if (!user) {
				throw new ApiError(meta.errors.credentialRequired);
			}
			if (!token || !token.appId) {
				throw new ApiError(meta.errors.noAppLogin);
			}

			const app = token.app ?? await this.appsRepository.findOneByOrFail({ id: token.appId });

			return await this.appEntityService.pack(app, user, {
				detail: true,
				includeSecret: false,
			});
		});
	}
}
