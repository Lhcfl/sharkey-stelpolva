/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueueService } from '@/core/QueueService.js';
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
		ref: 'QueueCounts',
	},
} as const satisfies IEndpointMeta;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const satisfies Schema;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private readonly queueService: QueueService,
	) {
		super(meta, paramDef, async () => {
			return await this.queueService.queueGetCounts();
		});
	}
}
