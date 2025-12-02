/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { DriveFoldersRepository } from '@/models/_.js';
import { QueryService } from '@/core/QueryService.js';
import { DriveFolderEntityService } from '@/core/entities/DriveFolderEntityService.js';
import { DI } from '@/di-symbols.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { promiseMap } from '@/misc/promise-map.js';

export const meta = {
	tags: ['drive'],

	requireCredential: true,

	kind: 'read:drive',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'DriveFolder',
		},
	},

	// 10 calls per 5 seconds
	limit: {
		duration: 1000 * 5,
		max: 10,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		folderId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		searchQuery: { type: 'string', default: '' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFoldersRepository)
		private driveFoldersRepository: DriveFoldersRepository,

		private driveFolderEntityService: DriveFolderEntityService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.queryService.makePaginationQuery(this.driveFoldersRepository.createQueryBuilder('folder'), ps.sinceId, ps.untilId)
				.andWhere('folder.userId = :userId', { userId: me.id });

			if (ps.folderId) {
				query.andWhere('folder.parentId = :parentId', { parentId: ps.folderId });
			} else {
				query.andWhere('folder.parentId IS NULL');
			}

			if (ps.searchQuery.length > 0) {
				query.andWhere('folder.name ILIKE :searchQuery', { searchQuery: `%${sqlLikeEscape(ps.searchQuery)}%` });
			}
			const folders = await query.limit(ps.limit).getMany();

			return await promiseMap(folders, async folder => await this.driveFolderEntityService.pack(folder), { limit: 4 });
		});
	}
}
