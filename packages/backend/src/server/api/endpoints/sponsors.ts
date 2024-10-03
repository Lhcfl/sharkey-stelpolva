/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { SponsorsService } from '@/core/SponsorsService.js';

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
		private sponsorsService: SponsorsService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.instance) {
				return { sponsor_data: await this.sponsorsService.instanceSponsors(ps.forceUpdate) };
			} else {
				return { sponsor_data: await this.sponsorsService.sharkeySponsors(ps.forceUpdate) };
			}
		});
	}
}
