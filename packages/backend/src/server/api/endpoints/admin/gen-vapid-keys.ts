/*
 * SPDX-FileCopyrightText: marie and sharkey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import webpush from 'web-push';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:meta',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			public: {
				type: 'string',
				optional: false, nullable: false,
			},
			private: {
				type: 'string',
				optional: false, nullable: false,
			},
		},
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
		private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async () => {
			const keys = webpush.generateVAPIDKeys();

			// TODO add moderation log

			return { public: keys.publicKey, private: keys.privateKey };
		});
	}
}
