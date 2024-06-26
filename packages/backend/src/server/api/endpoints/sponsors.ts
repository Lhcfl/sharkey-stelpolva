/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['meta'],
	description: 'Get Sharkey GH Sponsors',

	requireCredential: false,
	requireCredentialPrivateMode: false,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		forceUpdate: { type: 'boolean', default: false },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
        @Inject(DI.redis) private redisClient: Redis.Redis,
	) {
		super(meta, paramDef, async (ps, me) => {
			let sponsors;
			const cachedSponsors = await this.redisClient.get('sponsors');
			if (!ps.forceUpdate && cachedSponsors) {
				sponsors = JSON.parse(cachedSponsors);
			} else {
				AbortSignal.timeout ??= function timeout(ms) {
					const ctrl = new AbortController();
					setTimeout(() => ctrl.abort(), ms);
					return ctrl.signal;
				};

				try {
					sponsors = await fetch('https://kaifa.ch/transfem-sponsors.json', { signal: AbortSignal.timeout(2000) })
						.then((response) => response.json());

					await this.redisClient.set('sponsors', JSON.stringify(sponsors), 'EX', 3600);
				} catch (error) {
					sponsors = {
						sponsors: [],
					};
				}
			}
			return { sponsor_data: sponsors['sponsors'] };
		});
	}
}
