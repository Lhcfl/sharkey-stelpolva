/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { QUEUE_TYPES, QueueService } from '@/core/QueueService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:queue',

	res: {
		type: 'array',
		nullable: false, optional: false,
		items: {
			type: 'object',
			nullable: false, optional: false,
			properties: {
				id: {
					type: 'string',
					nullable: false, optional: true,
				},
				name: {
					type: 'string',
					nullable: false, optional: false,
				},
				data: {
					type: 'object',
					nullable: true, optional: true,
					additionalProperties: true,
				},
				opts: {
					type: 'object',
					nullable: false, optional: false,
					additionalProperties: true,
				},
				timestamp: {
					type: 'number',
					nullable: false, optional: false,
				},
				processedOn: {
					type: 'number',
					nullable: false, optional: true,
				},
				processedBy: {
					type: 'string',
					nullable: false, optional: true,
				},
				finishedOn: {
					type: 'number',
					nullable: false, optional: true,
				},
				progress: {},
				attempts: {
					type: 'number',
					nullable: false, optional: false,
				},
				delay: {
					type: 'number',
					nullable: false, optional: false,
				},
				failedReason: {
					type: 'string',
					nullable: false, optional: true,
				},
				stackTrace: {
					type: 'array',
					nullable: false, optional: true,
					items: {
						type: 'string',
					},
				},
				returnValue: {},
				isFailed: {
					type: 'boolean',
					nullable: false, optional: true,
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		queue: { type: 'string', enum: QUEUE_TYPES },
		state: { type: 'array', items: { type: 'string', enum: ['active', 'paused', 'wait', 'delayed', 'completed', 'failed'] } },
		search: { type: 'string' },
	},
	required: ['queue', 'state'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private queueService: QueueService,
	) {
		super(meta, paramDef, async (ps, me) => {
			return await this.queueService.queueGetJobs(ps.queue, ps.state, ps.search);
		});
	}
}
