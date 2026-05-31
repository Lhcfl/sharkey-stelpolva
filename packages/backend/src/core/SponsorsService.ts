/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { CacheManagementService, type ManagedRedisKVCache } from '@/global/CacheManagementService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';

export interface Sponsor {
	MemberId: number;
	createdAt: string;
	type: string;
	role: string;
	tier: string;
	isActive: boolean;
	totalAmountDonated: number;
	currency: string;
	lastTransactionAt: string;
	lastTransactionAmount: number;
	profile: string;
	name: string;
	company: string | null;
	description: string | null;
	image: string | null;
	email: string | null;
	newsletterOptIn: unknown | null;
	twitter: string | null;
	github: string | null;
	website: string | null;
}

@Injectable()
export class SponsorsService {
	private readonly cache: ManagedRedisKVCache<Sponsor[]>;

	constructor(
		@Inject(DI.meta)
		private readonly meta: MiMeta,
		private readonly httpRequestService: HttpRequestService,

		cacheManagementService: CacheManagementService,
	) {
		this.cache = cacheManagementService.createRedisKVCache<Sponsor[]>('sponsors', {
			lifetime: 1000 * 60 * 60,
			memoryCacheLifetime: 1000 * 60,
			fetcher: async (key) => {
				if (key === 'instance') return await this.fetchInstanceSponsors();
				return await this.fetchSharkeySponsors();
			},
			toRedisConverter: (value) => JSON.stringify(value),
			fromRedisConverter: (value) => JSON.parse(value),
		});
	}

	@bindThis
	private async fetchInstanceSponsors(): Promise<Sponsor[]> {
		if (!this.meta.donationUrl?.startsWith('https://opencollective.com')) {
			return [];
		}

		try {
			const backers = await this.httpRequestService.getJson<Sponsor[]>(`${this.meta.donationUrl}/members/users.json`);

			// Merge both together into one array and make sure it only has Active subscriptions
			const allSponsors = [...backers].filter(sponsor => sponsor.isActive && sponsor.role === 'BACKER' && sponsor.tier);

			// Remove possible duplicates
			return [...new Map(allSponsors.map(v => [v.profile, v])).values()];
		} catch {
			return [];
		}
	}

	@bindThis
	private async fetchSharkeySponsors(): Promise<Sponsor[]> {
		try {
			const backers = await this.httpRequestService.getJson<Sponsor[]>('https://opencollective.com/sharkey/tiers/backer/all.json');
			const sponsorsOC = await this.httpRequestService.getJson<Sponsor[]>('https://opencollective.com/sharkey/tiers/sponsor/all.json');

			// Merge both together into one array and make sure it only has Active subscriptions
			const allSponsors = [...sponsorsOC, ...backers].filter(sponsor => sponsor.isActive);

			// Remove possible duplicates
			return [...new Map(allSponsors.map(v => [v.profile, v])).values()];
		} catch {
			return [];
		}
	}

	@bindThis
	public async instanceSponsors(forceUpdate: boolean) {
		if (forceUpdate) await this.cache.refresh('instance');
		return await this.cache.fetch('instance');
	}

	@bindThis
	public async sharkeySponsors(forceUpdate: boolean) {
		if (forceUpdate) await this.cache.refresh('sharkey');
		return await this.cache.fetch('sharkey');
	}
}
