/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { MoreThan } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { BubbleGameRecordsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { TimeService } from '@/global/TimeService.js';

export const meta = {
	allowGet: true,
	cacheSec: 60,

	errors: {
	},

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: {
					type: 'string', format: 'misskey:id',
					optional: false, nullable: false,
				},
				score: {
					type: 'integer',
					optional: false, nullable: false,
				},
				user: {
					type: 'object',
					optional: true, nullable: false,
					ref: 'UserLite',
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
		gameMode: { type: 'string' },
	},
	required: ['gameMode'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.bubbleGameRecordsRepository)
		private bubbleGameRecordsRepository: BubbleGameRecordsRepository,

		private userEntityService: UserEntityService,
		private readonly timeService: TimeService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const records = await this.bubbleGameRecordsRepository.find({
				where: {
					gameMode: ps.gameMode,
					seededAt: MoreThan(new Date(this.timeService.now - 1000 * 60 * 60 * 24 * 7)),
				},
				order: {
					score: 'DESC',
				},
				take: 10,
				relations: ['user'],
			});

			const users = await this.userEntityService.packMany(records.map(r => r.user!), me);

			return records.map(r => ({
				id: r.id,
				score: r.score,
				user: users.find(u => u.id === r.user!.id),
			}));
		});
	}
}
