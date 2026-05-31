/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { IsNull, MoreThan, Not, type DataSource } from 'typeorm';
import si from 'systeminformation';
import { DI } from '@/di-symbols.js';
import { USER_ONLINE_THRESHOLD } from '@/const.js';
import { bindThis } from '@/decorators.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import {
	CacheManagementService,
	type ManagedMemorySingleCache,
	type ManagedRedisSingleCache,
} from '@/global/CacheManagementService.js';
import NotesChart from '@/core/chart/charts/notes.js';
import UsersChart from '@/core/chart/charts/users.js';
import { TimeService } from '@/global/TimeService.js';
import { EnvService } from '@/global/EnvService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { QueryService } from '@/core/QueryService.js';
import type {
	DriveFilesRepository,
	FollowingsRepository,
	InstancesRepository,
	NoteReactionsRepository,
	UsersRepository,
} from '@/models/_.js';
import type { Logger } from '@/logger.js';
import type { Redis } from 'ioredis';

export interface InstanceStats {
	/**
	 * The number of local posts on the instance.
	 * Updated hourly.
	 */
	localNotes: number;

	/**
	 * The number of remote posts known to the instance.
	 * Updated hourly.
	 */
	remoteNotes: number;

	/**
	 * The number of local users currently registered on the instance.
	 * Updated hourly.
	 */
	localUsers: number;

	/**
	 * The number of local users who are currently active.
	 * Updated every USER_ONLINE_THRESHOLD (currently 10 minutes).
	 */
	localUsersOnline: number;

	/**
	 * The number of local users who have been active within the past month.
	 * Updated daily.
	 */
	localUsersThisMonth: number;

	/**
	 * The number of local users who have been active within the past 6 months.
	 * Updated weekly.
	 */
	localUsersSixMonths: number;

	/**
	 * The number of remote users known to the instance.
	 * Updated hourly.
	 */
	remoteUsers: number;

	/**
	 * The number of remote users who are currently active.
	 * Updated every USER_ONLINE_THRESHOLD (currently 10 minutes).
	 */
	remoteUsersOnline: number;

	/**
	 * The number of local and remote reactions on the instance.
	 * Updated hourly.
	 */
	totalReactions: number;

	/**
	 * The number of instances known to the instance.
	 * Updated hourly.
	 */
	totalInstances: number;

	/**
	 * The number of bytes used by remote drive files.
	 * Updated daily.
	 */
	localDriveUsage: number;

	/**
	 * The number of bytes used by local drive files.
	 * Updated daily.
	 */
	remoteDriveUsage: number;

	/**
	 * The number of remote->local follow relations. (they follow us)
	 * Updated hourly.
	 */
	pubCount: number;

	/**
	 * The number of local->remote follow relations. (we follow them)
	 * Updated hourly.
	 */
	subCount: number;

	/**
	 * Static hardware/software platform hosting this server.
	 * Updated on each boot.
	 */
	platform: InstancePlatform;

	/**
	 * Dynamic hardware/software environment hosting this server.
	 * Updated every minute.
	 */
	environment: InstanceEnvironment;
}

export interface InstancePlatform {
	/** Machine hostname */
	machineName: string;
	/** OS platform name */
	osName: string;

	/** CPU model */
	cpuModel: string;
	/** CPU core count */
	cpuCores: number;

	/** Total memory (bytes) */
	memory: number;

	/** NodeJS version */
	nodeVersion: string;
}

export interface InstanceEnvironment {
	/** PostgreSQL version string */
	postgresVersion: string;
	/** Redis version string */
	redisVersion: string;

	/** Total size of disk0 (bytes) */
	diskCapacity: number;
	/** Used size of disk0 (bytes) */
	diskUsage: number;

	/** Default network interface */
	defaultNetwork: string;
}

@Injectable()
export class InstanceStatsService implements OnApplicationBootstrap {
	private readonly logger: Logger;

	private readonly postsCache: ManagedMemorySingleCache<[local: number, remote: number]>;
	private readonly usersCache: ManagedMemorySingleCache<[local: number, remote: number]>;
	private readonly localUsersOnlineCache: ManagedRedisSingleCache<number>;
	private readonly remoteUsersOnlineCache: ManagedRedisSingleCache<number>;
	private readonly localUsersThisMonthCache: ManagedRedisSingleCache<number>;
	private readonly localUsersSixMonthsCache: ManagedRedisSingleCache<number>;
	private readonly totalReactionsCache: ManagedMemorySingleCache<number>;
	private readonly totalInstancesCache: ManagedMemorySingleCache<number>;
	private readonly driveCache: ManagedRedisSingleCache<[local: number, remote: number]>;
	private readonly pubSubCache: ManagedRedisSingleCache<[pub: number, sub: number]>;
	private readonly instancePlatformCache: ManagedMemorySingleCache<InstancePlatform>;
	private readonly instanceEnvironmentCache: ManagedMemorySingleCache<InstanceEnvironment>;

	constructor(
		@Inject(DI.db)
		private readonly db: DataSource,

		@Inject(DI.redis)
		private readonly redisClient: Redis,

		@Inject(DI.usersRepository)
		private readonly usersRepository: UsersRepository,

		@Inject(DI.noteReactionsRepository)
		private readonly noteReactionsRepository: NoteReactionsRepository,

		@Inject(DI.instancesRepository)
		private readonly instancesRepository: InstancesRepository,

		@Inject(DI.driveFilesRepository)
		private readonly driveFilesRepository: DriveFilesRepository,

		@Inject(DI.followingsRepository)
		private readonly followingsRepository: FollowingsRepository,

		private readonly notesChart: NotesChart,
		private readonly usersChart: UsersChart,
		private readonly timeService: TimeService,
		private readonly queryService: QueryService,
		private readonly envService: EnvService,

		cacheManagementService: CacheManagementService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('stats');
		this.postsCache = cacheManagementService.createMemorySingleCache<[local: number, remote: number]>('postMetrics', 1000 * 60 * 60); // 1h
		this.usersCache = cacheManagementService.createMemorySingleCache<[local: number, remote: number]>('userMetrics', 1000 * 60 * 60); // 1h
		this.localUsersOnlineCache = cacheManagementService.createRedisSingleCache<number>('localUsersOnline', {
			lifetime: USER_ONLINE_THRESHOLD, // 10m
			fetcher: async () => {
				const threshold = new Date(this.timeService.now - USER_ONLINE_THRESHOLD);
				return await this.usersRepository.countBy({
					lastActiveDate: MoreThan(threshold),
					host: IsNull(),
				});
			},
		});
		this.remoteUsersOnlineCache = cacheManagementService.createRedisSingleCache<number>('remoteUsersOnline', {
			lifetime: USER_ONLINE_THRESHOLD, // 10m
			fetcher: async () => {
				const threshold = new Date(this.timeService.now - USER_ONLINE_THRESHOLD);
				return await this.usersRepository.countBy({
					lastActiveDate: MoreThan(threshold),
					host: Not(IsNull()),
				});
			},
		});
		this.localUsersThisMonthCache = cacheManagementService.createRedisSingleCache<number>('localUsersThisMonth', {
			lifetime: 1000 * 60 * 60 * 24, // 1d
			fetcher: async () => {
				const now = this.timeService.now;
				const monthAgo = new Date(now - 2592000000);
				return await this.usersRepository.countBy({
					host: IsNull(),
					isBot: false,
					lastActiveDate: MoreThan(monthAgo),
				});
			},
		});
		this.localUsersSixMonthsCache = cacheManagementService.createRedisSingleCache<number>('localUsersSixMonths', {
			lifetime: 1000 * 60 * 60 * 24 * 7, // 1w
			fetcher: async () => {
				const now = this.timeService.now;
				const halfYearAgo = new Date(now - 15552000000);
				return await this.usersRepository.countBy({
					host: IsNull(),
					isBot: false,
					lastActiveDate: MoreThan(halfYearAgo),
				});
			},
		});
		this.totalReactionsCache = cacheManagementService.createMemorySingleCache<number>('totalReactions', 1000 * 60 * 60); // 1h
		this.totalInstancesCache = cacheManagementService.createMemorySingleCache<number>('totalInstances', 1000 * 60 * 60); // 1h
		this.driveCache = cacheManagementService.createRedisSingleCache('driveUsage', {
			lifetime: 1000 * 60 * 60 * 24, // 1 day
			fetcher: async () => [
				await this.driveFilesRepository.sum('size', { userHost: IsNull() }) ?? 0,
				await this.driveFilesRepository.sum('size', { userHost: Not(IsNull()) }) ?? 0,
			],
		});
		this.pubSubCache = cacheManagementService.createRedisSingleCache('pubSubCount', {
			lifetime: 1000 * 60 * 60, // 1 hour
			fetcher: async () => [
				await this.followingsRepository.countBy({ followerHost: Not(IsNull()) }),
				await this.followingsRepository.countBy({ followeeHost: Not(IsNull()) }),
			],
		});
		this.instancePlatformCache = cacheManagementService.createMemorySingleCache('instancePlatform', Infinity); // immutable
		this.instanceEnvironmentCache = cacheManagementService.createMemorySingleCache('instanceEnvironment', 1000 * 60); // 1 minute
	}

	@bindThis
	public async onApplicationBootstrap() {
		if (this.envService.env.NODE_ENV === 'test') {
			this.logger.debug('Skipping statistic pre-load in TEST');
			return;
		}

		this.logger.info('Pre-loading baseline statistics...');
		await this.fetch();
	}

	@bindThis
	public async fetch(): Promise<InstanceStats> {
		// Intentionally not awaited, because each promise needs to fork twice.
		const totalPosts = this.stub(this.fetchPosts, 'total posts', [0, 0])();
		const totalUsers = this.stub(this.fetchUsers, 'total users', [0, 0])();
		const totalDrive = this.stub(this.fetchDrive, 'total drive', [0, 0])();
		const totalFedi = this.stub(this.fetchPubSub, 'federation', [0, 0])();

		return awaitAll({
			localNotes: totalPosts.then(tp => tp[0]),
			remoteNotes: totalPosts.then(tp => tp[1]),
			localUsers: totalUsers.then(tu => tu[0]),
			remoteUsers: totalUsers.then(tu => tu[1]),
			remoteUsersOnline: this.stub(this.fetchRemoteOnline, 'online remote users', 0)(),
			localUsersOnline: this.stub(this.fetchLocalOnline, 'online local users', 0)(),
			localUsersThisMonth: this.stub(this.fetchActiveMonth, 'monthly users', 0)(),
			localUsersSixMonths: this.stub(this.fetchActiveSixMonths, 'six-month users', 0)(),
			totalReactions: this.stub(this.fetchTotalReactions, 'total reactions', 0)(),
			totalInstances: this.stub(this.fetchTotalInstances, 'total instances', 0)(),
			localDriveUsage: totalDrive.then(td => td[0]),
			remoteDriveUsage: totalDrive.then(td => td[1]),
			pubCount: totalFedi.then(ps => ps[0]),
			subCount: totalFedi.then(ps => ps[1]),
			platform: this.stub(this.fetchPlatform, 'platform', {
				machineName: '?',
				osName: '?',
				cpuModel: '?',
				cpuCores: 1,
				memory: 0,
				nodeVersion: '?',
			})(),
			environment: this.stub(this.fetchEnvironment, 'environment', {
				postgresVersion: '?',
				redisVersion: '?',
				diskCapacity: 0,
				diskUsage: 0,
				defaultNetwork: '?',
			})(),
		});
	}

	@bindThis
	private async fetchActiveSixMonths(): Promise<number> {
		return await this.localUsersSixMonthsCache.fetch();
	}

	@bindThis
	private async fetchActiveMonth(): Promise<number> {
		return await this.localUsersThisMonthCache.fetch();
	}

	@bindThis
	private async fetchPosts(): Promise<[local: number, remote: number]> {
		return await this.postsCache.fetch(async () => {
			const chart = await this.notesChart.getChart('hour', 1, null);
			return [chart.local.total[0], chart.remote.total[0]];
		});
	}

	@bindThis
	private async fetchUsers(): Promise<[local: number, remote: number]> {
		return await this.usersCache.fetch(async () => {
			const chart = await this.usersChart.getChart('hour', 1, null);
			return [chart.local.total[0], chart.remote.total[0]];
		});
	}

	@bindThis
	private async fetchLocalOnline(): Promise<number> {
		return await this.localUsersOnlineCache.fetch();
	}

	@bindThis
	private async fetchRemoteOnline(): Promise<number> {
		return await this.remoteUsersOnlineCache.fetch();
	}

	@bindThis
	private async fetchTotalReactions(): Promise<number> {
		return await this.totalReactionsCache.fetch(async () => {
			return await this.queryService.estimateCount(this.noteReactionsRepository);
		});
	}

	@bindThis
	private async fetchTotalInstances(): Promise<number> {
		return await this.totalInstancesCache.fetch(async () => {
			return await this.queryService.estimateCount(this.instancesRepository);
		});
	}

	@bindThis
	private async fetchDrive(): Promise<[local: number, remote: number]> {
		return await this.driveCache.fetch();
	}

	@bindThis
	private async fetchPubSub(): Promise<[pub: number, sub: number]> {
		return await this.pubSubCache.fetch();
	}

	@bindThis
	private async fetchPlatform(): Promise<InstancePlatform> {
		return await this.instancePlatformCache.fetch(async () => {
			const os = await si.osInfo();
			const cpu = await si.cpu();
			const mem = await si.mem();
			return {
				machineName: os.hostname,
				osName: os.platform,
				cpuModel: `${cpu.manufacturer} ${cpu.brand}`,
				cpuCores: cpu.cores,
				memory: mem.total,
				nodeVersion: process.version,
			};
		});
	}

	@bindThis
	private async fetchEnvironment(): Promise<InstanceEnvironment> {
		return await this.instanceEnvironmentCache.fetch(async () => {
			// Parallel because each is to a different resource category.
			const [redisInfo, pgVersion, netIntDef, disks] = await Promise.all([
				this.redisClient.info('Server'),
				this.db.query<{ server_version: string }[]>('SHOW server_version'),
				si.networkInterfaceDefault(),
				si.fsSize(),
			]);

			// Adapted from MK admin/server-info.ts
			const redisVersion = redisInfo.match(/^redis_version:(.*)/m)?.at(1);
			const postgresVersion = pgVersion.at(0)?.server_version;

			return {
				postgresVersion: postgresVersion || '?',
				redisVersion: redisVersion || '?',
				diskCapacity: disks.at(0)?.size ?? 0,
				diskUsage: disks.at(0)?.used ?? 0,
				defaultNetwork: netIntDef || '?',
			};
		});
	}

	@bindThis
	private stub<T>(f: () => Promise<T>, type: string, def: T): (() => Promise<T>) {
		return async () => {
			try {
				return await f();
			} catch (err) {
				this.logger.warn(`Failed to collect stats category "${type}" - the relevant data will be zeroed out for the current cache interval. Error cause: ${renderInlineError(err)}`);
				return def;
			}
		};
	}
}
