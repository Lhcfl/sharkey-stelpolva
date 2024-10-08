/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { MetaService } from '@/core/MetaService.js';
import { RedisKVCache } from '@/misc/cache.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class SponsorsService implements OnApplicationShutdown {
	private cache: RedisKVCache<void[]>;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,
		
		private metaService: MetaService,
	) {
		this.cache = new RedisKVCache<void[]>(this.redisClient, 'sponsors', {
			lifetime: 1000 * 60 * 60,
			memoryCacheLifetime: 1000 * 60,
			fetcher: (key) => {
				if (key === 'instance') return this.fetchInstanceSponsors();
				return this.fetchSharkeySponsors();
			},
			toRedisConverter: (value) => JSON.stringify(value),
			fromRedisConverter: (value) => JSON.parse(value),
		});
	}

	@bindThis
	private async fetchInstanceSponsors() {
		const meta = await this.metaService.fetch();

		if (!(meta.donationUrl && meta.donationUrl.includes('opencollective.com'))) {
			return [];
		}

		try {
			const backers = await fetch(`${meta.donationUrl}/members/users.json`).then((response) => response.json());

			// Merge both together into one array and make sure it only has Active subscriptions
			const allSponsors = [...backers].filter(sponsor => sponsor.isActive === true && sponsor.role === 'BACKER' && sponsor.tier);

			// Remove possible duplicates
			return [...new Map(allSponsors.map(v => [v.profile, v])).values()];
		} catch (error) {
			return [];
		}
	}

	@bindThis
	private async fetchSharkeySponsors() {
		try {
			const backers = await fetch('https://opencollective.com/sharkey/tiers/backer/all.json').then((response) => response.json());
			const sponsorsOC = await fetch('https://opencollective.com/sharkey/tiers/sponsor/all.json').then((response) => response.json());

			// Merge both together into one array and make sure it only has Active subscriptions
			const allSponsors = [...sponsorsOC, ...backers].filter(sponsor => sponsor.isActive === true);

			// Remove possible duplicates
			return [...new Map(allSponsors.map(v => [v.profile, v])).values()];
		} catch (error) {
			return [];
		}
	}

	@bindThis
	public async instanceSponsors(forceUpdate: boolean) {
		if (forceUpdate) this.cache.refresh('instance');
		return this.cache.fetch('instance');
	}

	@bindThis
	public async sharkeySponsors(forceUpdate: boolean) {
		if (forceUpdate) this.cache.refresh('sharkey');
		return this.cache.fetch('sharkey');
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.cache.dispose();
	}
}
