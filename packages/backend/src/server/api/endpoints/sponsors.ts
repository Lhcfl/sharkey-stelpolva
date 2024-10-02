/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { MetaService } from '@/core/MetaService.js';

export const meta = {
	tags: ['meta'],
	description: 'Get Sharkey Sponsors or Instance Sponsors',

	requireCredential: false,
	requireCredentialPrivateMode: false,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		forceUpdate: { type: 'boolean', default: false },
		instance: { type: 'boolean', default: false },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
        @Inject(DI.redis) private redisClient: Redis.Redis,
		private metaService: MetaService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let totalSponsors: any;

			const maybeCached = async (key: string, forcedUpdate: boolean, fetch_cb: () => void) => {
				// get Key first before doing the if statement as it can be defined as either string or null
				const cached = await this.redisClient.get(key);
				
				if (!forcedUpdate && cached) {
					return JSON.parse(cached);
				}

				try {
					const result = await fetch_cb();
					await this.redisClient.set(key, JSON.stringify(totalSponsors), 'EX', 3600);
					return result;
				} catch (e) { return []; }
			};
			
			if (ps.instance) {
				return { sponsor_data: await maybeCached('instanceSponsors', ps.forceUpdate, async () => {
					try {
						const meta = await this.metaService.fetch();
						if (meta.donationUrl && !meta.donationUrl.includes('opencollective.com')) {
							return [];
						} else if (meta.donationUrl) {
							const backers = await fetch(`${meta.donationUrl}/members/users.json`).then((response) => response.json());
	
							// Merge both together into one array and make sure it only has Active subscriptions
							const allSponsors = [...backers].filter(sponsor => sponsor.isActive === true && sponsor.role === 'BACKER' && sponsor.tier);
	
							// Remove possible duplicates
							totalSponsors = [...new Map(allSponsors.map(v => [v.profile, v])).values()];
							
							await this.redisClient.set('instanceSponsors', JSON.stringify(totalSponsors), 'EX', 3600);
							return totalSponsors;
						} else {
							return [];
						}
					} catch (error) {
						return [];
					}
				}) };
			} else {
				return { sponsor_data: await maybeCached('sponsors', ps.forceUpdate, async () => {
					try {
						const backers = await fetch('https://opencollective.com/sharkey/tiers/backer/all.json').then((response) => response.json());
						const sponsorsOC = await fetch('https://opencollective.com/sharkey/tiers/sponsor/all.json').then((response) => response.json());
	
						// Merge both together into one array and make sure it only has Active subscriptions
						const allSponsors = [...sponsorsOC, ...backers].filter(sponsor => sponsor.isActive === true);
	
						// Remove possible duplicates
						totalSponsors = [...new Map(allSponsors.map(v => [v.profile, v])).values()];
	
						await this.redisClient.set('sponsors', JSON.stringify(totalSponsors), 'EX', 3600);
						return totalSponsors;
					} catch (error) {
						return [];
					}
				}) };
			}
		});
	}
}
