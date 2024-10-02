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
			let totalSponsors;
			const cachedSponsors = await this.redisClient.get('sponsors');	

			if (!ps.forceUpdate && !ps.instance && cachedSponsors) {
				totalSponsors = JSON.parse(cachedSponsors);
			} else if (!ps.instance) {
				try {
					const backers = await fetch('https://opencollective.com/sharkey/tiers/backer/all.json').then((response) => response.json());
					const sponsorsOC = await fetch('https://opencollective.com/sharkey/tiers/sponsor/all.json').then((response) => response.json());

					// Merge both together into one array and make sure it only has Active subscriptions
					const allSponsors = [...sponsorsOC, ...backers].filter(sponsor => sponsor.isActive === true);

					// Remove possible duplicates
					totalSponsors = [...new Map(allSponsors.map(v => [v.profile, v])).values()];

					await this.redisClient.set('sponsors', JSON.stringify(totalSponsors), 'EX', 3600);
				} catch (error) {
					totalSponsors = [];
				}
			} else {
				try {
					const meta = await this.metaService.fetch();
					if (meta.donationUrl && !meta.donationUrl.includes('opencollective.com')) {
						totalSponsors = [];
					} else if (meta.donationUrl) {
						const backers = await fetch(`${meta.donationUrl}/members/users.json`).then((response) => response.json());

						// Merge both together into one array and make sure it only has Active subscriptions
						const allSponsors = [...backers].filter(sponsor => sponsor.isActive === true && sponsor.role === 'BACKER');

						// Remove possible duplicates
						totalSponsors = [...new Map(allSponsors.map(v => [v.profile, v])).values()];
					} else {
						totalSponsors = [];
					}
				} catch (error) {
					totalSponsors = [];
				}
			}
			return { sponsor_data: totalSponsors };
		});
	}
}
