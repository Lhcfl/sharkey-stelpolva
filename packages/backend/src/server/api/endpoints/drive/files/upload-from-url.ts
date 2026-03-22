/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { DriveService } from '@/core/DriveService.js';
import { ApiError } from '@/server/api/error.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';

export const meta = {
	tags: ['drive'],

	limit: {
		duration: ms('1hour'),
		max: 60,
	},

	description: 'Request the server to download a new drive file from the specified URL.',

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:drive',

	errors: {
		commentTooLong: {
			message: 'Cannot upload the file because the comment exceeds the instance limit.',
			code: 'COMMENT_TOO_LONG',
			id: '333652d9-0826-40f5-a2c3-e2bedcbb9fe5',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		url: { type: 'string' },
		folderId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		isSensitive: { type: 'boolean', default: false },
		comment: { type: 'string', nullable: true, default: null },
		marker: { type: 'string', nullable: true, default: null },
		force: { type: 'boolean', default: false },
		isForImport: { type: 'boolean', default: false },
	},
	required: ['url'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.config)
		private config: Config,

		private driveFileEntityService: DriveFileEntityService,
		private driveService: DriveService,
		private globalEventService: GlobalEventService,
	) {
		super(meta, paramDef, async (ps, user, _1, _2, _3, ip, headers) => {
			if (ps.comment && ps.comment.length > this.config.maxAltTextLength) {
				throw new ApiError(meta.errors.commentTooLong);
			}

			this.driveService.uploadFromUrl({ url: ps.url, user, folderId: ps.folderId, sensitive: ps.isSensitive, force: ps.force, comment: ps.comment, requestIp: ip, requestHeaders: headers, isForImport: ps.isForImport }).then(file => {
				this.driveFileEntityService.pack(file, { self: true }).then(packedFile => {
					this.globalEventService.publishMainStream(user.id, 'urlUploadFinished', {
						marker: ps.marker,
						file: packedFile,
					});
				});
			});
		});
	}
}
