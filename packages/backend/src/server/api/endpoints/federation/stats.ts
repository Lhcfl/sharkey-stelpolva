/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IsNull, MoreThan, Not } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { FollowingsRepository, InstancesRepository } from '@/models/_.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { InstanceEntityService } from '@/core/entities/InstanceEntityService.js';
import { InstanceStatsService } from '@/core/InstanceStatsService.js';
import { DI } from '@/di-symbols.js';
import type { IEndpointMeta } from '@/server/api/endpoints.js';
import type { Schema } from '@/misc/json-schema.js';

export const meta = {
	tags: ['federation'],

	requiredRolePolicy: 'canViewFederation',
	requireCredential: false,

	allowGet: true,
	cacheSec: 60 * 60, // 1h

	res: {
		type: 'object',
		optional: false,
		nullable: false,
		properties: {
			topSubInstances: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'FederationInstance',
				},
			},
			otherFollowersCount: { type: 'number' },
			topPubInstances: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'FederationInstance',
				},
			},
			otherFollowingCount: { type: 'number' },
		},
	},

	// Up to 50 calls, then 5/second
	limit: {
		type: 'bucket',
		size: 50,
		dripRate: 250,
	},
} as const satisfies IEndpointMeta;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
	required: [],
} as const satisfies Schema;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private instanceEntityService: InstanceEntityService,
		private readonly instanceStatsService: InstanceStatsService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const [topSubInstances, topPubInstances, { pubCount: allPubCount, subCount: allSubCount }] = await Promise.all([
				this.instancesRepository.find({
					where: {
						followersCount: MoreThan(0),
					},
					order: {
						followersCount: 'DESC',
					},
					take: ps.limit,
				}),
				this.instancesRepository.find({
					where: {
						followingCount: MoreThan(0),
					},
					order: {
						followingCount: 'DESC',
					},
					take: ps.limit,
				}),
				this.instanceStatsService.fetch(),
			]);

			const gotSubCount = topSubInstances.map(x => x.followersCount).reduce((a, b) => a + b, 0);
			const gotPubCount = topPubInstances.map(x => x.followingCount).reduce((a, b) => a + b, 0);

			return await awaitAll({
				topSubInstances: this.instanceEntityService.packMany(topSubInstances, me),
				otherFollowersCount: Math.max(0, allSubCount - gotSubCount),
				topPubInstances: this.instanceEntityService.packMany(topPubInstances, me),
				otherFollowingCount: Math.max(0, allPubCount - gotPubCount),
			});
		});
	}
}
