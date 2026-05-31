/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	Inject,
	Injectable,
	type BeforeApplicationShutdown,
	type OnApplicationShutdown,
} from '@nestjs/common';
import {
	MemoryKVCache,
	MemorySingleCache,
	RedisKVCache,
	RedisSingleCache,
	type RedisKVCacheOpts,
	type RedisSingleCacheOpts,
	type MemoryCacheServices,
	type RedisCacheServices,
	type MemoryCacheOpts,
} from '@/misc/cache.js';
import {
	QuantumKVCache,
	type QuantumKVOpts,
	type QuantumCacheServices,
} from '@/misc/QuantumKVCache.js';
import { CollapsedQueue, type CollapsedQueueOpts, type CollapsedQueueServices } from '@/misc/collapsed-queue.js';
import { TimeService, type TimerHandle } from '@/global/TimeService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { callAllAsync, callAllOn, callAllOnAsync } from '@/misc/call-all.js';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import type Logger from '@/logger.js';
import type * as Redis from 'ioredis';

// This is the one place that's *supposed* to new() up caches.
/* eslint-disable no-restricted-syntax */

export type ManagedMemoryKVCache<T> = Managed<MemoryKVCache<T>>;
export type ManagedMemorySingleCache<T> = Managed<MemorySingleCache<T>>;
export type ManagedRedisKVCache<T> = Managed<RedisKVCache<T>>;
export type ManagedRedisSingleCache<T> = Managed<RedisSingleCache<T>>;
export type ManagedQuantumKVCache<T> = Managed<QuantumKVCache<T>>;
export type ManagedCollapsedQueue<T> = Managed<CollapsedQueue<T>>;

export type Managed<T> = Omit<T, 'dispose' | 'onApplicationShutdown' | 'gc'>;
export type CacheManager = { dispose(): Promise<void> | void, clear(): void, gc(): void };
export type QueueManager = { dispose(): Promise<void>, performAllNow(): Promise<void> };

type CacheServices = MemoryCacheServices & RedisCacheServices & QuantumCacheServices & CollapsedQueueServices;

export const GC_INTERVAL = 1000 * 60 * 3; // 3m

/**
 * Creates and "manages" instances of any standard cache type.
 * Instances produced by this class are automatically tracked for disposal when the application shuts down.
 */
@Injectable()
export class CacheManagementService implements BeforeApplicationShutdown, OnApplicationShutdown {
	private readonly collapsedQueueLogger: Logger;

	private readonly managedCaches = new Map<string, CacheManager>();
	private readonly managedQueues = new Map<string, QueueManager>();

	private gcTimer?: TimerHandle | null;

	constructor(
		@Inject(DI.redis)
		private readonly redisClient: Redis.Redis,

		private readonly timeService: TimeService,
		private readonly internalEventService: InternalEventService,

		@Inject(DI.globalLogger)
		globalLogger: Logger,
	) {
		this.collapsedQueueLogger = globalLogger.createSubLogger('defer');
	}

	private get cacheServices(): CacheServices {
		return {
			internalEventService: this.internalEventService,
			redisClient: this.redisClient,
			timeService: this.timeService,
			parentLogger: this.collapsedQueueLogger,
		};
	}

	@bindThis
	public createMemoryKVCache<T>(name: string, optsOrLifetime: MemoryCacheOpts | number): ManagedMemoryKVCache<T> {
		const opts = typeof(optsOrLifetime) === 'number' ? { lifetime: optsOrLifetime } : optsOrLifetime;
		return this.create(name, 'cache', this.managedCaches, () => new MemoryKVCache<T>(name, this.cacheServices, opts));
	}

	@bindThis
	public createMemorySingleCache<T>(name: string, optsOrLifetime: MemoryCacheOpts | number): ManagedMemorySingleCache<T> {
		const opts = typeof(optsOrLifetime) === 'number' ? { lifetime: optsOrLifetime } : optsOrLifetime;
		return this.create(name, 'cache', this.managedCaches, () => new MemorySingleCache<T>(name, this.cacheServices, opts));
	}

	@bindThis
	public createRedisKVCache<T>(name: string, opts: RedisKVCacheOpts<T>): ManagedRedisKVCache<T> {
		return this.create(name, 'cache', this.managedCaches, () => new RedisKVCache<T>(name, this.cacheServices, opts));
	}

	@bindThis
	public createRedisSingleCache<T>(name: string, opts: RedisSingleCacheOpts<T>): ManagedRedisSingleCache<T> {
		return this.create(name, 'cache', this.managedCaches, () => new RedisSingleCache<T>(name, this.cacheServices, opts));
	}

	@bindThis
	public createQuantumKVCache<T>(name: string, opts: QuantumKVOpts<T>): ManagedQuantumKVCache<T> {
		return this.create(name, 'cache', this.managedCaches, () => new QuantumKVCache<T>(name, this.cacheServices, opts));
	}

	@bindThis
	public createCollapsedQueue<T>(name: string, opts: CollapsedQueueOpts<T>): ManagedCollapsedQueue<T> {
		return this.create(name, 'queue', this.managedQueues, () => new CollapsedQueue<T>(name, this.cacheServices, opts));
	}

	private create<T extends CacheManager>(name: string, type: 'cache', repo: Map<string, CacheManager>, factory: () => T): Managed<T>;
	private create<T extends QueueManager>(name: string, type: 'queue', repo: Map<string, QueueManager>, factory: () => T): Managed<T>;

	private create<T extends CacheManager | QueueManager>(name: string, type: string, repo: Map<string, T>, factory: () => T): Managed<T> {
		if (repo.has(name)) {
			throw new Error(`Duplicate ${type} name: "${name}"`);
		}

		const cache = factory();

		repo.set(name, cache);
		this.startGcTimer();

		return cache;
	}

	@bindThis
	public gc(): void {
		this.resetGcTimer(() => {
			callAllOn(this.managedCaches.values(), 'gc');
		});
	}

	@bindThis
	public async clear(): Promise<void> {
		await this.resetGcTimerAsync(async () => {
			await callAllAsync([
				() => callAllOnAsync(this.managedQueues.values(), 'performAllNow'),
				() => callAllOn(this.managedCaches.values(), 'clear'),
			]);
		});
	}

	@bindThis
	public async dispose(): Promise<void> {
		this.stopGcTimer();

		const queuesToDispose = this.managedQueues.values().toArray();
		this.managedQueues.clear();

		const cachesToDispose = this.managedCaches.values().toArray();
		this.managedCaches.clear();

		// Queues first, since some of the persist methods call into caches.
		await callAllOnAsync(queuesToDispose, 'dispose');
		await callAllOnAsync(cachesToDispose, 'dispose');
	}

	@bindThis
	public async beforeApplicationShutdown(): Promise<void> {
		// Synchronous cleanup to avoid overloading the DB during shutdown
		for (const queue of this.managedQueues.values()) {
			await queue.performAllNow();
		}
	}

	@bindThis
	public async onApplicationShutdown(): Promise<void> {
		await this.dispose();
	}

	@bindThis
	private startGcTimer() {
		// Only start it once, and don't *re* start since this gets called repeatedly.
		this.gcTimer ??= this.timeService.startTimer(this.gc, GC_INTERVAL, { repeated: true });
	}

	@bindThis
	private stopGcTimer() {
		// Only stop it once, then clear the value so it can be restarted later.
		if (this.gcTimer != null) {
			this.timeService.stopTimer(this.gcTimer);
			this.gcTimer = null;
		}
	}

	@bindThis
	private resetGcTimer(onBlank?: () => void): void {
		this.stopGcTimer();

		try {
			if (onBlank) {
				onBlank();
			}
		} finally {
			this.startGcTimer();
		}
	}

	@bindThis
	private async resetGcTimerAsync(onBlank: () => Promise<void> | void): Promise<void> {
		this.stopGcTimer();

		try {
			await onBlank();
		} finally {
			this.startGcTimer();
		}
	}
}
