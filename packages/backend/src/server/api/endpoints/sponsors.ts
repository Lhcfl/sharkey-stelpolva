/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { SponsorsService } from '@/core/SponsorsService.js';

export const meta = {
	tags: ['meta'],
	description: 'Get Sharkey Sponsors or Instance Sponsors',

	requireCredential: false,
	requireCredentialPrivateMode: false,

	res: {
		type: 'object',
		nullable: false, optional: false,
		properties: {
			sponsor_data: {
				type: 'array',
				nullable: false, optional: false,
				items: {
					type: 'object',
					nullable: false, optional: false,
					properties: {
						name: {
							type: 'string',
							nullable: false, optional: false,
						},
						image: {
							type: 'string',
							nullable: true, optional: false,
						},
						website: {
							type: 'string',
							nullable: true, optional: false,
						},
						profile: {
							type: 'string',
							nullable: false, optional: false,
						},
					},
				},
			},
		},
	},

	// 2 calls per second
	limit: {
		duration: 1000,
		max: 2,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		// TODO remove this or make staff-only to prevent DoS
		forceUpdate: { type: 'boolean', default: false },
		instance: { type: 'boolean', default: false },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private sponsorsService: SponsorsService,
	) {
		super(meta, paramDef, async (ps) => {
			const sponsors = ps.instance
				? await this.sponsorsService.instanceSponsors(ps.forceUpdate)
				: await this.sponsorsService.sharkeySponsors(ps.forceUpdate);

			return {
				sponsor_data: sponsors.map(s => ({
					name: s.name,
					image: s.image,
					website: s.website,
					profile: s.profile,
				})),
			};
		});
	}
}
