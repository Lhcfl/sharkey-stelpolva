/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { getJsonSchema } from '@/core/chart/core.js';
import PerUserFollowingChart from '@/core/chart/charts/per-user-following.js';
import { schema } from '@/core/chart/charts/entities/per-user-following.js';
import { CacheService } from '@/core/CacheService.js';
import { RoleService } from '@/core/RoleService.js';

export const meta = {
	tags: ['charts', 'users', 'following'],

	res: getJsonSchema(schema),

	allowGet: true,
	cacheSec: 60 * 60,

	// Burst up to 200, then 5/sec average
	limit: {
		type: 'bucket',
		size: 200,
		dripRate: 200,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		span: { type: 'string', enum: ['day', 'hour'] },
		limit: { type: 'integer', minimum: 1, maximum: 500, default: 30 },
		offset: { type: 'integer', nullable: true, default: null },
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['span', 'userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private perUserFollowingChart: PerUserFollowingChart,
		private readonly cacheService: CacheService,
		private readonly roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const profile = await this.cacheService.userProfileCache.fetch(ps.userId);

			// These are structured weird to avoid un-necessary calls to roleService and cacheService
			const iAmModeratorOrTarget = me && (me.id === ps.userId || await this.roleService.isModerator(me));
			const iAmFollowingOrTarget = me && (me.id === ps.userId || await this.cacheService.isFollowing(me.id, ps.userId));

			const canViewFollowing =
				profile.followingVisibility === 'public'
				|| iAmModeratorOrTarget
				|| (profile.followingVisibility === 'followers' && iAmFollowingOrTarget);

			const canViewFollowers =
				profile.followersVisibility === 'public'
				|| iAmModeratorOrTarget
				|| (profile.followersVisibility === 'followers' && iAmFollowingOrTarget);

			if (!canViewFollowing && !canViewFollowers) {
				return {
					local: {
						followings: {
							total: [],
							inc: [],
							dec: [],
						},
						followers: {
							total: [],
							inc: [],
							dec: [],
						},
					},
					remote: {
						followings: {
							total: [],
							inc: [],
							dec: [],
						},
						followers: {
							total: [],
							inc: [],
							dec: [],
						},
					},
				};
			}

			const chart = await this.perUserFollowingChart.getChart(ps.span, ps.limit, ps.offset ? new Date(ps.offset) : null, ps.userId);

			if (!canViewFollowers) {
				chart.local.followers = {
					total: [],
					inc: [],
					dec: [],
				};
				chart.remote.followers = {
					total: [],
					inc: [],
					dec: [],
				};
			}

			if (!canViewFollowing) {
				chart.local.followings = {
					total: [],
					inc: [],
					dec: [],
				};
				chart.remote.followings = {
					total: [],
					inc: [],
					dec: [],
				};
			}

			return chart;
		});
	}
}
