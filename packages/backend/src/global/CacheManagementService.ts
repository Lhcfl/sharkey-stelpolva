/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
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
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import { TimeService, type TimerHandle } from '@/global/TimeService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { callAllOn, callAllOnAsync } from '@/misc/call-all.js';
import type * as Redis from 'ioredis';

// This is the one place that's *supposed* to new() up caches.
/* eslint-disable no-restricted-syntax */

export type ManagedMemoryKVCache<T> = Managed<MemoryKVCache<T>>;
export type ManagedMemorySingleCache<T> = Managed<MemorySingleCache<T>>;
export type ManagedRedisKVCache<T> = Managed<RedisKVCache<T>>;
export type ManagedRedisSingleCache<T> = Managed<RedisSingleCache<T>>;
export type ManagedQuantumKVCache<T> = Managed<QuantumKVCache<T>>;

export type Managed<T> = Omit<T, 'dispose' | 'onApplicationShutdown' | 'gc'>;
export type Manager = { dispose(): Promise<void> | void, clear(): void, gc(): void };

type CacheServices = MemoryCacheServices & RedisCacheServices & QuantumCacheServices;

export const GC_INTERVAL = 1000 * 60 * 3; // 3m

/**
 * Creates and "manages" instances of any standard cache type.
 * Instances produced by this class are automatically tracked for disposal when the application shuts down.
 */
@Injectable()
export class CacheManagementService implements OnApplicationShutdown {
	private readonly managedCaches = new Map<string, Manager>();
	private gcTimer?: TimerHandle | null;

	constructor(
		@Inject(DI.redis)
		private readonly redisClient: Redis.Redis,

		private readonly timeService: TimeService,
		private readonly internalEventService: InternalEventService,
	) {}

	private get cacheServices(): CacheServices {
		return {
			internalEventService: this.internalEventService,
			redisClient: this.redisClient,
			timeService: this.timeService,
		};
	}

	@bindThis
	public createMemoryKVCache<T>(name: string, optsOrLifetime: MemoryCacheOpts | number): ManagedMemoryKVCache<T> {
		const opts = typeof(optsOrLifetime) === 'number' ? { lifetime: optsOrLifetime } : optsOrLifetime;
		return this.create(name, () => new MemoryKVCache<T>(name, this.cacheServices, opts));
	}

	@bindThis
	public createMemorySingleCache<T>(name: string, optsOrLifetime: MemoryCacheOpts | number): ManagedMemorySingleCache<T> {
		const opts = typeof(optsOrLifetime) === 'number' ? { lifetime: optsOrLifetime } : optsOrLifetime;
		return this.create(name, () => new MemorySingleCache<T>(name, this.cacheServices, opts));
	}

	@bindThis
	public createRedisKVCache<T>(name: string, opts: RedisKVCacheOpts<T>): ManagedRedisKVCache<T> {
		return this.create(name, () => new RedisKVCache<T>(name, this.cacheServices, opts));
	}

	@bindThis
	public createRedisSingleCache<T>(name: string, opts: RedisSingleCacheOpts<T>): ManagedRedisSingleCache<T> {
		return this.create(name, () => new RedisSingleCache<T>(name, this.cacheServices, opts));
	}

	@bindThis
	public createQuantumKVCache<T>(name: string, opts: QuantumKVOpts<T>): ManagedQuantumKVCache<T> {
		return this.create(name, () => new QuantumKVCache<T>(name, this.cacheServices, opts));
	}

	private create<T extends Manager>(name: string, factory: () => T): T {
		if (this.managedCaches.has(name)) {
			throw new Error(`Duplicate cache name: "${name}"`);
		}

		const cache = factory();

		this.managedCaches.set(name, cache);
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
	public clear(): void {
		this.resetGcTimer(() => {
			callAllOn(this.managedCaches.values(), 'clear');
		});
	}

	@bindThis
	public async dispose(): Promise<void> {
		this.stopGcTimer();

		const toDispose = Array.from(this.managedCaches.values());
		this.managedCaches.clear();

		await callAllOnAsync(toDispose, 'dispose');
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
}
