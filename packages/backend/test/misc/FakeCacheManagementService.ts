/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { GodOfTimeService } from './GodOfTimeService.js';
import { MockInternalEventService } from './MockInternalEventService.js';
import { MockRedis } from './MockRedis.js';
import type * as Redis from 'ioredis';
import type { QuantumKVOpts } from '@/misc/QuantumKVCache.js';
import type { RedisKVCacheOpts, RedisSingleCacheOpts, MemoryCacheOpts } from '@/misc/cache.js';
import type { TimeService } from '@/global/TimeService.js';
import type { InternalEventService } from '@/global/InternalEventService.js';
import {
	CacheManagementService,
	type ManagedMemoryKVCache,
	type ManagedMemorySingleCache,
	type ManagedRedisKVCache,
	type ManagedRedisSingleCache,
	type ManagedQuantumKVCache,
} from '@/global/CacheManagementService.js';

/**
 * Fake implementation of cache management that suppresses all caching behavior.
 * The returned cache instances are real and fully functional, but expiration is negative to ensure that data is immediately discarded and nothing is cached.
 * Essentially, it strips out the caching behavior and converts caches into pure data accessors.
 */
@Injectable()
export class FakeCacheManagementService extends CacheManagementService {
	constructor(opts?: {
		redisClient?: Redis.Redis;
		timeService?: TimeService;
		internalEventService?: InternalEventService;
	}) {
		const timeService = opts?.timeService ?? new GodOfTimeService();
		const redisClient = opts?.redisClient ?? new MockRedis(timeService);
		const internalEventService = opts?.internalEventService ?? new MockInternalEventService();

		super(redisClient, timeService, internalEventService);
	}

	createMemoryKVCache<T>(name: string, optsOrLifetime: number | MemoryCacheOpts): ManagedMemoryKVCache<T> {
		const opts = typeof(optsOrLifetime) === 'number' ? { lifetime: -1 } : { ...optsOrLifetime, lifetime: -1 };
		return super.createMemoryKVCache(name, opts);
	}

	createMemorySingleCache<T>(name: string, optsOrLifetime: number | MemoryCacheOpts): ManagedMemorySingleCache<T> {
		const opts = typeof(optsOrLifetime) === 'number' ? { lifetime: -1 } : { ...optsOrLifetime, lifetime: -1 };
		return super.createMemorySingleCache(name, opts);
	}

	createRedisKVCache<T>(name: string, opts: RedisKVCacheOpts<T>): ManagedRedisKVCache<T> {
		return super.createRedisKVCache(name, {
			...opts,
			lifetime: -1,
			memoryCacheLifetime: -1,
		});
	}

	createRedisSingleCache<T>(name: string, opts: RedisSingleCacheOpts<T>): ManagedRedisSingleCache<T> {
		return super.createRedisSingleCache(name, {
			...opts,
			lifetime: -1,
			memoryCacheLifetime: -1,
		});
	}

	createQuantumKVCache<T>(name: string, opts: QuantumKVOpts<T>): ManagedQuantumKVCache<T> {
		return super.createQuantumKVCache(name, {
			...opts,
			lifetime: -1,
		});
	}
}
