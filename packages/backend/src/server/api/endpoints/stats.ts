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
	requireCredential: false,

	allowGet: true,
	cacheSec: 60 * 60, // 1h

	tags: ['meta'],

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			notesCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			originalNotesCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			usersCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			originalUsersCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			instances: {
				type: 'number',
				optional: false, nullable: false,
			},
			driveUsageLocal: {
				type: 'number',
				optional: false, nullable: false,
			},
			driveUsageRemote: {
				type: 'number',
				optional: false, nullable: false,
			},
		},
	},

	// Up to 10 calls, then 2/second
	limit: {
		type: 'bucket',
		size: 10,
		dripRate: 500,
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
				notesCount: stats.localNotes + stats.remoteNotes,
				originalNotesCount: stats.localNotes,
				usersCount: stats.localUsers + stats.remoteUsers,
				originalUsersCount: stats.localUsers,
				reactionsCount: stats.totalReactions,
				instances: stats.totalInstances,
				driveUsageLocal: stats.localDriveUsage,
				driveUsageRemote: stats.remoteDriveUsage,
			};
		});
	}
}
