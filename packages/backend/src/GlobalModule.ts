/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	Global,
	Inject,
	Module,
	type Provider,
	type OnModuleInit,
	type OnApplicationShutdown,
} from '@nestjs/common';
import * as Redis from 'ioredis';
import { IsNull, Not, type DataSource } from 'typeorm';
import { MeiliSearch } from 'meilisearch';
import type { MiMeta } from '@/models/Meta.js';
import type { MetasRepository } from '@/models/_.js';
import type { Logger } from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { loadConfig, type Config } from '@/config.js';
import { allSettled } from '@/misc/promise-tracker.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { createPostgresDataSource } from '@/postgres.js';
import { TimeService, NativeTimeService } from '@/global/TimeService.js';
import { EnvService } from '@/global/EnvService.js';
import { CacheManagementService } from '@/global/CacheManagementService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { DependencyService } from '@/global/DependencyService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { IdService } from '@/core/IdService.js';
import { repositoryProviders } from '@/models/RepositoryModule.js';
import { DI } from './di-symbols.js';

async function fetchMeta(metasRepository: MetasRepository, logger: Logger): Promise<MiMeta> {
	let meta = await metasRepository.findOne({ where: { id: Not(IsNull()) }, order: { id: 'DESC' } });

	if (!meta) {
		logger.info('Meta table is empty; populating with defaults.');

		// No-op UPSERT to safely create the row
		await metasRepository.upsert({ id: 'x' }, ['id']);
		meta = await metasRepository.findOneOrFail({ where: { id: Not(IsNull()) }, order: { id: 'DESC' } });
	}

	return meta;
}

const $config: Provider = {
	provide: DI.config,
	useFactory: (globalLogger: Logger) => loadConfig(globalLogger),
	inject: [DI.globalLogger, EnvService],
};

const $db: Provider = {
	provide: DI.db,
	useFactory: async (config: Config, globalLogger: Logger, envService: EnvService) => {
		const db = createPostgresDataSource(config, globalLogger, envService);
		return await db.initialize();
	},
	inject: [DI.config, DI.globalLogger, EnvService],
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
		return new Redis.Redis(config.redisForPubsub);
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
	useFactory: async (metasRepository: MetasRepository, globalLogger: Logger) => {
		return await fetchMeta(metasRepository, globalLogger);
	},
	inject: [DI.metasRepository, DI.globalLogger],
};

const $GlobalLogger: Provider = {
	provide: DI.globalLogger,
	useFactory: (loggerService: LoggerService) => loggerService.getLogger('global'),
	inject: [LoggerService],
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
const $IdService: Provider[] = [IdService, { provide: 'IdService', useExisting: IdService }];
const $nodeId: Provider = {
	provide: DI.nodeId,
	useFactory: (idService: IdService) => idService.genSimple(),
	inject: [IdService],
};

@Global()
@Module({
	providers: [
		// Resources
		$config,
		$db,
		$meilisearch,
		$redis,
		$redisForPub,
		$redisForSub,
		$redisForTimelines,
		$redisForReactions,
		$redisForRateLimit,

		// Repositories
		repositoryProviders,
		$meta,
		$nodeId,

		// Services
		$CacheManagementService,
		$InternalEventService,
		$TimeService,
		$EnvService,
		$LoggerService,
		$Console,
		$DependencyService,
		$IdService,

		// Internals (not exported)
		$GlobalLogger,
	].flat(),
	exports: [
		// Resources
		$config,
		$db,
		$meilisearch,
		$redis,
		$redisForPub,
		$redisForSub,
		$redisForTimelines,
		$redisForReactions,
		$redisForRateLimit,

		// Repositories
		repositoryProviders,
		$meta,
		$nodeId,

		// Services
		$CacheManagementService,
		$InternalEventService,
		$TimeService,
		$EnvService,
		$LoggerService,
		$Console,
		$DependencyService,
		$IdService,
	].flat(),
})
export class GlobalModule implements OnModuleInit, OnApplicationShutdown {
	constructor(
		@Inject(DI.db)
		private readonly db: DataSource,

		@Inject(DI.redis)
		private readonly redisClient: Redis.Redis,

		@Inject(DI.redisForPub)
		private readonly redisForPub: Redis.Redis,

		@Inject(DI.redisForSub)
		private readonly redisForSub: Redis.Redis,

		@Inject(DI.redisForTimelines)
		private readonly redisForTimelines: Redis.Redis,

		@Inject(DI.redisForReactions)
		private readonly redisForReactions: Redis.Redis,

		@Inject(DI.redisForRateLimit)
		private readonly redisForRateLimit: Redis.Redis,

		@Inject(DI.metasRepository)
		private readonly metasRepository: MetasRepository,

		@Inject(DI.meta)
		private readonly meta: MiMeta,

		@Inject(DI.globalLogger)
		private readonly logger: Logger,

		@Inject(DI.nodeId)
		private readonly nodeId: string,

		private readonly internalEventService: InternalEventService,
	) { }

	@bindThis
	public async onApplicationShutdown(): Promise<void> {
		// Wait for all potential DB queries
		this.logger.info('Finalizing active tasks...');
		await allSettled();

		// Terminate meta sync
		this.internalEventService.off('metaUpdated', this.onMetaUpdated);

		// Disconnect from Postgres
		// (this must come before Redis in case caching is enabled)
		this.logger.info('Disconnecting from Postgres...');
		await this.db.destroy();

		// Disconnect from Redis
		this.logger.info('Disconnecting from Redis...');
		this.safeDisconnect(this.redisClient);
		this.safeDisconnect(this.redisForPub);
		this.safeDisconnect(this.redisForSub);
		this.safeDisconnect(this.redisForTimelines);
		this.safeDisconnect(this.redisForReactions);
		this.safeDisconnect(this.redisForRateLimit);

		this.logger.info(`Node ${this.nodeId} terminated.`);
	}

	@bindThis
	public async onModuleInit(): Promise<void> {
		// Begin meta sync
		this.internalEventService.on('metaUpdated', this.onMetaUpdated);

		this.logger.info(`Node ${this.nodeId} started in process ${process.pid}.`);
	}

	@bindThis
	private async onMetaUpdated(): Promise<void> {
		const before = Object.assign({}, this.meta);
		const after = await fetchMeta(this.metasRepository, this.logger);

		Object.assign(this.meta, after);
		this.logger.debug('Updated meta from remote change: ', { before, after });
	}

	@bindThis
	private safeDisconnect(redis: Redis.Redis): void {
		try {
			redis.disconnect();
		} catch (err) {
			this.logger.error(`Unhandled error disconnecting redis: ${renderInlineError(err)}`);
		}
	}
}
