/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Global, Inject, Module } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { MeiliSearch } from 'meilisearch';
import { MiMeta } from '@/models/Meta.js';
import { bindThis } from '@/decorators.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { TimeService, NativeTimeService } from '@/global/TimeService.js';
import { EnvService } from '@/global/EnvService.js';
import { CacheManagementService } from '@/global/CacheManagementService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { DependencyService } from '@/global/DependencyService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { DI } from './di-symbols.js';
import { Config, loadConfig } from './config.js';
import { createPostgresDataSource } from './postgres.js';
import { RepositoryModule } from './models/RepositoryModule.js';
import { allSettled } from './misc/promise-tracker.js';
import { GlobalEvents } from './core/GlobalEventService.js';
import Logger from './logger.js';
import type { Provider, OnApplicationShutdown } from '@nestjs/common';

const $config: Provider = {
	provide: DI.config,
	useFactory: (loggerService: LoggerService) => loadConfig(loggerService),
	inject: [LoggerService],
};

const $db: Provider = {
	provide: DI.db,
	useFactory: async (config: Config, loggerService: LoggerService) => {
		const db = createPostgresDataSource(config, loggerService);
		return await db.initialize();
	},
	inject: [DI.config, LoggerService],
};

const $meilisearch: Provider = {
	provide: DI.meilisearch,
	useFactory: (config: Config) => {
		if (config.fulltextSearch?.provider === 'meilisearch') {
			if (!config.meilisearch) {
				throw new Error('MeiliSearch is enabled but no configuration is provided');
			}

			return new MeiliSearch({
				host: `${config.meilisearch.ssl ? 'https' : 'http'}://${config.meilisearch.host}:${config.meilisearch.port}`,
				apiKey: config.meilisearch.apiKey,
			});
		} else {
			return null;
		}
	},
	inject: [DI.config],
};

const $redis: Provider = {
	provide: DI.redis,
	useFactory: (config: Config) => {
		return new Redis.Redis(config.redis);
	},
	inject: [DI.config],
};

const $redisForPub: Provider = {
	provide: DI.redisForPub,
	useFactory: (config: Config) => {
		const redis = new Redis.Redis(config.redisForPubsub);
		return redis;
	},
	inject: [DI.config],
};

const $redisForSub: Provider = {
	provide: DI.redisForSub,
	useFactory: (config: Config) => {
		const redis = new Redis.Redis(config.redisForPubsub);
		redis.subscribe(config.host);
		return redis;
	},
	inject: [DI.config],
};

const $redisForTimelines: Provider = {
	provide: DI.redisForTimelines,
	useFactory: (config: Config) => {
		return new Redis.Redis(config.redisForTimelines);
	},
	inject: [DI.config],
};

const $redisForReactions: Provider = {
	provide: DI.redisForReactions,
	useFactory: (config: Config) => {
		return new Redis.Redis(config.redisForReactions);
	},
	inject: [DI.config],
};

const $redisForRateLimit: Provider = {
	provide: DI.redisForRateLimit,
	useFactory: (config: Config) => {
		return new Redis.Redis(config.redisForRateLimit);
	},
	inject: [DI.config],
};

const $meta: Provider = {
	provide: DI.meta,
	useFactory: async (db: DataSource, redisForSub: Redis.Redis) => {
		const meta = await db.transaction(async transactionalEntityManager => {
			// 過去のバグでレコードが複数出来てしまっている可能性があるので新しいIDを優先する
			const metas = await transactionalEntityManager.find(MiMeta, {
				order: {
					id: 'DESC',
				},
			});

			const meta = metas[0];

			if (meta) {
				return meta;
			} else {
				// metaが空のときfetchMetaが同時に呼ばれるとここが同時に呼ばれてしまうことがあるのでフェイルセーフなupsertを使う
				const saved = await transactionalEntityManager
					.upsert(
						MiMeta,
						{
							id: 'x',
						},
						['id'],
					)
					.then((x) => transactionalEntityManager.findOneByOrFail(MiMeta, x.identifiers[0]));

				return saved;
			}
		});

		async function onMessage(_: string, data: string): Promise<void> {
			const obj = JSON.parse(data);

			if (obj.channel === 'internal') {
				const { type, body } = obj.message as GlobalEvents['internal']['payload'];
				switch (type) {
					case 'metaUpdated': {
						for (const key in body.after) {
							(meta as any)[key] = (body.after as any)[key];
						}
						meta.rootUser = null; // joinなカラムは通常取ってこないので
						break;
					}
					default:
						break;
				}
			}
		}

		redisForSub.on('message', onMessage);

		return meta;
	},
	inject: [DI.db, DI.redisForSub],
};

const $CacheManagementService: Provider[] = [CacheManagementService, { provide: 'CacheManagementService', useExisting: CacheManagementService }];
const $InternalEventService: Provider[] = [InternalEventService, { provide: 'InternalEventService', useExisting: InternalEventService }];
const $TimeService: Provider[] = [
	{ provide: TimeService, useClass: NativeTimeService },
	{ provide: 'TimeService', useExisting: TimeService },
];
const $EnvService: Provider[] = [EnvService, { provide: 'EnvService', useExisting: EnvService }];
const $LoggerService: Provider[] = [LoggerService, { provide: 'LoggerService', useExisting: LoggerService }];
const $Console: Provider[] = [{ provide: DI.console, useFactory: () => global.console }]; // useValue will break overrideProvider for some reason
const $DependencyService: Provider[] = [DependencyService, { provide: 'DependencyService', useExisting: DependencyService }];

@Global()
@Module({
	imports: [RepositoryModule],
	providers: [$config, $db, $meta, $meilisearch, $redis, $redisForPub, $redisForSub, $redisForTimelines, $redisForReactions, $redisForRateLimit, $CacheManagementService, $InternalEventService, $TimeService, $EnvService, $LoggerService, $Console, $DependencyService].flat(),
	exports: [$config, $db, $meta, $meilisearch, $redis, $redisForPub, $redisForSub, $redisForTimelines, $redisForReactions, $redisForRateLimit, $CacheManagementService, $InternalEventService, $TimeService, $EnvService, $LoggerService, RepositoryModule, $Console, $DependencyService].flat(),
})
export class GlobalModule implements OnApplicationShutdown {
	private readonly logger = new Logger('global');

	constructor(
		@Inject(DI.db) private db: DataSource,
		@Inject(DI.redis) private redisClient: Redis.Redis,
		@Inject(DI.redisForPub) private redisForPub: Redis.Redis,
		@Inject(DI.redisForSub) private redisForSub: Redis.Redis,
		@Inject(DI.redisForTimelines) private redisForTimelines: Redis.Redis,
		@Inject(DI.redisForReactions) private redisForReactions: Redis.Redis,
		@Inject(DI.redisForRateLimit) private redisForRateLimit: Redis.Redis,
	) { }

	public async dispose(): Promise<void> {
		// Wait for all potential DB queries
		this.logger.info('Finalizing active promises...');
		await allSettled();
		// And then disconnect from DB
		this.logger.info('Disconnected from data sources...');
		await this.db.destroy();
		this.safeDisconnect(this.redisClient);
		this.safeDisconnect(this.redisForPub);
		this.safeDisconnect(this.redisForSub);
		this.safeDisconnect(this.redisForTimelines);
		this.safeDisconnect(this.redisForReactions);
		this.safeDisconnect(this.redisForRateLimit);
		this.logger.info('Global module disposed.');
	}

	@bindThis
	async onApplicationShutdown(signal: string): Promise<void> {
		await this.dispose();
	}

	private safeDisconnect(redis: { disconnect(): void }): void {
		try {
			redis.disconnect();
		} catch (err) {
			this.logger.error(`Unhandled error disconnecting redis: ${renderInlineError(err)}`);
		}
	}
}
