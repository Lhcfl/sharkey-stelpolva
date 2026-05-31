/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { type DataSource, IsNull, Not } from 'typeorm';
import * as Redis from 'ioredis';
import type { MetasRepository } from '@/models/_.js';
import { LoggerService } from '@/core/LoggerService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { resetDb } from '@/misc/reset-db.js';
import { MetaService } from '@/core/MetaService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { EnvService } from '@/global/EnvService.js';

export const meta = {
	tags: ['non-productive'],

	requireCredential: false,

	description: 'Only available when running with <code>NODE_ENV=testing</code>. Reset the database and flush Redis.',

	errors: {

	},

	// 2 calls per second
	limit: {
		duration: 1000,
		max: 2,
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
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.metasRepository)
		private readonly metasRepository: MetasRepository,

		private loggerService: LoggerService,
		private metaService: MetaService,
		private globalEventService: GlobalEventService,

		envService: EnvService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (envService.env.NODE_ENV !== 'test') throw new Error('NODE_ENV is not a test');

			const logger = this.loggerService.getLogger('reset-db');
			logger.info('---- Resetting database...');

			await this.redisClient.flushdb();
			await resetDb(this.db);

			// DIコンテナで管理しているmetaのインスタンスには上記のリセット処理が届かないため、
			// 初期値を流して明示的にリフレッシュする
			const after = await this.metasRepository.findOneOrFail({ where: { id: Not(IsNull()) }, order: { id: 'DESC' } });
			await this.metaService.update(after);

			logger.info('---- Database reset complete.');

			// Ignore rule - this is just testing code.
			// eslint-disable-next-line no-restricted-globals
			await new Promise(resolve => setTimeout(resolve, 1000));
		});
	}
}
