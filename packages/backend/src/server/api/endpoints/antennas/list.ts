/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AntennasRepository } from '@/models/_.js';
import { AntennaEntityService } from '@/core/entities/AntennaEntityService.js';
import { DI } from '@/di-symbols.js';
import { promiseMap } from '@/misc/promise-map.js';

export const meta = {
	tags: ['antennas', 'account'],

	requireCredential: true,

	kind: 'read:account',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Antenna',
		},
	},

	// 3 calls per second
	limit: {
		duration: 1000,
		max: 3,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		private antennaEntityService: AntennaEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const antennas = await this.antennasRepository.findBy({
				userId: me.id,
			});

			return await promiseMap(antennas, async x => await this.antennaEntityService.pack(x), { limit: 4 });
		});
	}
}
