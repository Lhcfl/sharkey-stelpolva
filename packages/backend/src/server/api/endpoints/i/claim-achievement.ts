/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { DI } from '@/di-symbols.js';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AchievementService, ACHIEVEMENT_TYPES } from '@/core/AchievementService.js';
import type { MiMeta } from '@/models/_.js';

export const meta = {
	requireCredential: true,
	prohibitMoved: true,
	kind: 'write:account',
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
