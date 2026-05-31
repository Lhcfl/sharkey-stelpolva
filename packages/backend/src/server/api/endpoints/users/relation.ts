/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { CacheService, Requested } from '@/core/CacheService.js';

export const meta = {
	tags: ['users'],

	requireCredential: true,
	kind: 'read:account',

	description: 'Show the different kinds of relations between the authenticated user and the specified user(s).',

	res: {
		optional: false, nullable: false,
		oneOf: [
			{
				type: 'object',
				properties: {
					id: {
						type: 'string',
						optional: false, nullable: false,
						format: 'id',
					},
					isFollowing: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					hasPendingFollowRequestFromYou: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					hasPendingFollowRequestToYou: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					isFollowed: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					isBlocking: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					isBlocked: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					isMuted: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					isRenoteMuted: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					isInstanceMuted: {
						type: 'boolean',
						optional: true, nullable: false,
					},
					memo: {
						type: 'string',
						optional: true, nullable: true,
					},
				},
			},
			{
				type: 'array',
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						id: {
							type: 'string',
							optional: false, nullable: false,
							format: 'id',
						},
						isFollowing: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						hasPendingFollowRequestFromYou: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						hasPendingFollowRequestToYou: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						isFollowed: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						isBlocking: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						isBlocked: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						isMuted: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						isRenoteMuted: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						isInstanceMuted: {
							type: 'boolean',
							optional: true, nullable: false,
						},
						memo: {
							type: 'string',
							optional: true, nullable: true,
						},
					},
				},
			},
		],
	},

	// 10 calls per 2 seconds
	limit: {
		duration: 1000 * 2,
		max: 10,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: {
			anyOf: [
				{ type: 'string', format: 'misskey:id' },
				{
					type: 'array',
					items: { type: 'string', format: 'misskey:id' },
				},
			],
		},
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private userEntityService: UserEntityService,
		private readonly cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const relations = Array.isArray(ps.userId)
				? await this.cacheService.getUserRelations(me, ps.userId).then(rels => rels.values().toArray())
				: await this.cacheService.getUserRelation(me, ps.userId).then(rel => [rel]);

			return relations.map(rel => ({
				id: rel.userId,
				isFollowing: !!rel.isFollowing,
				hasPendingFollowRequestFromYou: rel.isFollowing === Requested,
				hasPendingFollowRequestToYou: rel.isFollowed === Requested,
				isFollowed: !!rel.isFollowed,
				isBlocking: rel.isBlocking,
				isBlocked: rel.isBlocked,
				isMuted: rel.isMuting,
				isRenoteMuted: rel.isMutingRenotes,
				isInstanceMuted: rel.isMutingInstance,
				memo: rel.memo,
			}));
		});
	}
}
