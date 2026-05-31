/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { MiMeta } from '@/models/_.js';
import type { Schema } from '@/misc/json-schema.js';
import type { IEndpointMeta } from '@/server/api/endpoints.js';
import { DI } from '@/di-symbols.js';
import { InstanceStatsService } from '@/core/InstanceStatsService.js';

export const meta = {
	requireCredential: false,
	allowGet: true,
	cacheSec: 60,

	tags: ['meta'],
	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			machine: {
				type: 'string',
				nullable: false,
			},
			cpu: {
				type: 'object',
				nullable: false,
				properties: {
					model: {
						type: 'string',
						nullable: false,
					},
					cores: {
						type: 'number',
						nullable: false,
					},
				},
			},
			mem: {
				type: 'object',
				properties: {
					total: {
						type: 'number',
						nullable: false,
					},
				},
			},
			fs: {
				type: 'object',
				nullable: false,
				properties: {
					total: {
						type: 'number',
						nullable: false,
					},
					used: {
						type: 'number',
						nullable: false,
					},
				},
			},
		},
	},

	// 24 calls, then 7 per second-ish (1 for each type of server info graph)
	limit: {
		type: 'bucket',
		size: 24,
		dripSize: 7,
		dripRate: 900,
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
		@Inject(DI.meta)
		private readonly serverSettings: MiMeta,
		private readonly instanceStatsService: InstanceStatsService,
	) {
		super(meta, paramDef, async () => {
			if (!this.serverSettings.enableServerMachineStats) return {
				machine: '?',
				cpu: {
					model: '?',
					cores: 0,
				},
				mem: {
					total: 0,
				},
				fs: {
					total: 0,
					used: 0,
				},
			};

			const { platform, environment } = await this.instanceStatsService.fetch();
			return {
				machine: platform.machineName,
				cpu: {
					model: platform.cpuModel,
					cores: platform.cpuCores,
				},
				mem: {
					total: platform.memory,
				},
				fs: {
					total: environment.diskCapacity,
					used: environment.diskUsage,
				},
			};
		});
	}
}
