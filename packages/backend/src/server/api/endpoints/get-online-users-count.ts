/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { InstanceStatsService } from '@/core/InstanceStatsService.js';
import type { IEndpointMeta } from '@/server/api/endpoints.js';
import type { Schema } from '@/misc/json-schema.js';

export const meta = {
	tags: ['meta'],

	requireCredential: false,

	allowGet: true,
	cacheSec: 60,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			count: {
				type: 'number',
				nullable: false, optional: false,
			},
			countAcrossNetwork: {
				type: 'number',
				nullable: false, optional: false,
			},
		},
	},

	// 20 calls, then 4 per second
	limit: {
		type: 'bucket',
		size: 20,
		dripRate: 250,
	},
} as const satisfies IEndpointMeta;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const satisfies Schema;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private readonly instanceStatsService: InstanceStatsService,
	) {
		super(meta, paramDef, async () => {
			const stats = await this.instanceStatsService.fetch();
			return {
				count: stats.localUsersOnline,
				countAcrossNetwork: stats.localUsersOnline + stats.remoteUsersOnline,
			};
		});
	}
}
