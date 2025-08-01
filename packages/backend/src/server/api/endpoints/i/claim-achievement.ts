/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AchievementService } from '@/core/AchievementService.js';
import { ACHIEVEMENT_TYPES } from '@/models/UserProfile.js';
import type { MiMeta } from '@/models/_.js';

export const meta = {
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:account',

	// 10 calls per 5 seconds
	limit: {
		duration: 1000 * 5,
		max: 10,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string', enum: ACHIEVEMENT_TYPES },
	},
	required: ['name'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		private achievementService: AchievementService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (!this.serverSettings.enableAchievements) return;

			await this.achievementService.create(me.id, ps.name);
		});
	}
}
