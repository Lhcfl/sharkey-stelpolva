/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueueService } from '@/core/QueueService.js';
import { QUEUE_TYPES } from '@/queue/const.js';
import type { IEndpointMeta } from '@/server/api/endpoints.js';
import type { Schema } from '@/misc/json-schema.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:queue',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'QueueStat',
	},
} as const satisfies IEndpointMeta;

export const paramDef = {
	type: 'object',
	properties: {
		queue: { type: 'string', enum: QUEUE_TYPES },
	},
	required: ['queue'],
} as const satisfies Schema;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private readonly queueService: QueueService,
	) {
		super(meta, paramDef, async (ps) => {
			return await this.queueService.queueGetQueue(ps.queue);
		});
	}
}
