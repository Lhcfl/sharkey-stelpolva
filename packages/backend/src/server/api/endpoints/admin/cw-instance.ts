/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:cw-instance',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		host: { type: 'string' },
		cw: { type: 'string', nullable: true },
	},
	required: ['host', 'cw'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private readonly moderationLogService: ModerationLogService,
		private readonly federatedInstanceService: FederatedInstanceService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const instance = await this.federatedInstanceService.fetchOrRegister(ps.host);

			// Collapse empty strings to null
			const newCW = ps.cw?.trim() || null;
			const oldCW = instance.mandatoryCW;

			// Skip if there's nothing to do
			if (oldCW === newCW) return;

			// This synchronizes caches automatically
			await this.federatedInstanceService.update(instance.id, { mandatoryCW: newCW });

			await this.moderationLogService.log(me, 'setMandatoryCWForInstance', {
				newCW,
				oldCW,
				host: ps.host,
			});
		});
	}
}
