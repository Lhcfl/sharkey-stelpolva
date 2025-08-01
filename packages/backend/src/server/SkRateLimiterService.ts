/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import type { TimeService } from '@/core/TimeService.js';
import type { EnvService } from '@/core/EnvService.js';
import { BucketRateLimit, LegacyRateLimit, LimitInfo, RateLimit, hasMinLimit, isLegacyRateLimit, Keyed, hasMaxLimit, disabledLimitInfo, MaxLegacyLimit, MinLegacyLimit } from '@/misc/rate-limit-utils.js';
import { DI } from '@/di-symbols.js';
import { MemoryKVCache } from '@/misc/cache.js';
import type { MiUser } from '@/models/_.js';
import type { RoleService } from '@/core/RoleService.js';

// Sentinel value used for caching the default role template.
// Required because MemoryKVCache doesn't support null keys.
const defaultUserKey = '';

interface ParsedLimit {
	key: string;
	now: number;
	bucketSize: number;
	dripRate: number;
	dripSize: number;
	fullResetMs: number;
	fullResetSec: number;
}

@Injectable()
export class SkRateLimiterService {
	// 1-minute cache interval
	private readonly factorCache = new MemoryKVCache<number>(1000 * 60);
	// 10-second cache interval
	private readonly lockoutCache = new MemoryKVCache<number>(1000 * 10);
	private readonly requestCounts = new Map<string, number>();
	private readonly disabled: boolean;

	constructor(
		@Inject('TimeService')
		private readonly timeService: TimeService,

		@Inject(DI.redisForRateLimit)
		private readonly redisClient: Redis.Redis,

		@Inject('RoleService')
		private readonly roleService: RoleService,

		@Inject('EnvService')
		envService: EnvService,
	) {
		this.disabled = envService.env.NODE_ENV === 'test';
	}

	/**
	 * Check & increment a rate limit for a client.
	 *
	 * If the client (actorOrUser) is passed as a string, then it uses the default rate limit factor from the role template.
	 * If the client (actorOrUser) is passed as an MiUser, then it queries the user's actual rate limit factor from their assigned roles.
	 *
	 * A factor of zero (0) will disable the limit, while any negative number will produce an error.
	 * A factor between zero (0) and one (1) will increase the limit from its default values (allowing more actions per time interval).
	 * A factor greater than one (1) will decrease the limit from its default values (allowing fewer actions per time interval).
	 *
	 * @param limit The limit definition
	 * @param actorOrUser authenticated client user or IP hash
	 */
	public async limit(limit: Keyed<RateLimit>, actorOrUser: string | MiUser): Promise<LimitInfo> {
		if (this.disabled) {
			return disabledLimitInfo;
		}

		const actor = typeof(actorOrUser) === 'object' ? actorOrUser.id : actorOrUser;
		const actorKey = `@${actor}#${limit.key}`;

		const userCacheKey = typeof(actorOrUser) === 'object' ? actorOrUser.id : defaultUserKey;
		const userRoleKey = typeof(actorOrUser) === 'object' ? actorOrUser.id : null;
		const factor = this.factorCache.get(userCacheKey) ?? await this.factorCache.fetch(userCacheKey, async () => {
			const role = await this.roleService.getUserPolicies(userRoleKey);
			return role.rateLimitFactor;
		});

		if (factor === 0) {
			return disabledLimitInfo;
		}

		if (factor < 0) {
			throw new Error(`Rate limit factor is zero or negative: ${factor}`);
		}

		const parsedLimit = this.parseLimit(limit, factor);
		if (parsedLimit == null) {
			return disabledLimitInfo;
		}

		// Fast-path to avoid extra redis calls for blocked clients
		const lockout = this.getLockout(actorKey, parsedLimit);
		if (lockout) {
			return lockout;
		}

		// Fast-path to avoid queuing requests that are guaranteed to fail
		const overflow = this.incrementOverflow(actorKey, parsedLimit);
		if (overflow) {
			return overflow;
		}

		try {
			const info = await this.limitBucket(parsedLimit, actor);

			// Store blocked status to avoid hammering redis
			if (info.blocked) {
				this.lockoutCache.set(actorKey, info.resetMs);
			}

			return info;
		} finally {
			this.decrementOverflow(actorKey);
		}
	}

	private getLockout(lockoutKey: string, limit: ParsedLimit): LimitInfo | null {
		const lockoutReset = this.lockoutCache.get(lockoutKey);
		if (!lockoutReset) {
			// Not blocked, proceed with redis check
			return null;
		}

		if (limit.now >= lockoutReset) {
			// Block expired, clear and proceed with redis check
			this.lockoutCache.delete(lockoutKey);
			return null;
		}

		// Lockout is still active, pre-emptively reject the request
		return {
			blocked: true,
			remaining: 0,
			resetMs: limit.fullResetMs,
			resetSec: limit.fullResetSec,
			fullResetMs: limit.fullResetMs,
			fullResetSec: limit.fullResetSec,
		};
	}

	private parseLimit(limit: Keyed<RateLimit>, factor: number): ParsedLimit | null {
		if (isLegacyRateLimit(limit)) {
			return this.parseLegacyLimit(limit, factor);
		} else {
			return this.parseBucketLimit(limit, factor);
		}
	}

	private parseLegacyLimit(limit: Keyed<LegacyRateLimit>, factor: number): ParsedLimit | null {
		if (hasMaxLimit(limit)) {
			return this.parseLegacyMinMax(limit, factor);
		} else if (hasMinLimit(limit)) {
			return this.parseLegacyMinOnly(limit, factor);
		} else {
			return null;
		}
	}

	private parseLegacyMinMax(limit: Keyed<MaxLegacyLimit>, factor: number): ParsedLimit | null {
		if (limit.duration === 0) return null;
		if (limit.duration < 0) throw new Error(`Invalid rate limit ${limit.key}: duration is negative (${limit.duration})`);
		if (limit.max < 1) throw new Error(`Invalid rate limit ${limit.key}: max is less than 1 (${limit.max})`);

		// Derive initial dripRate from minInterval OR duration/max.
		const initialDripRate = Math.max(limit.minInterval ?? Math.round(limit.duration / limit.max), 1);

		// Calculate dripSize to reach max at exactly duration
		const dripSize = Math.max(Math.round(limit.max / (limit.duration / initialDripRate)), 1);

		// Calculate final dripRate from dripSize and duration/max
		const dripRate = Math.max(Math.round(limit.duration / (limit.max / dripSize)), 1);

		return this.parseBucketLimit({
			type: 'bucket',
			key: limit.key,
			size: limit.max,
			dripRate,
			dripSize,
		}, factor);
	}

	private parseLegacyMinOnly(limit: Keyed<MinLegacyLimit>, factor: number): ParsedLimit | null {
		if (limit.minInterval === 0) return null;
		if (limit.minInterval < 0) throw new Error(`Invalid rate limit ${limit.key}: minInterval is negative (${limit.minInterval})`);

		const dripRate = Math.max(Math.round(limit.minInterval), 1);
		return this.parseBucketLimit({
			type: 'bucket',
			key: limit.key,
			size: 1,
			dripRate,
			dripSize: 1,
		}, factor);
	}

	private parseBucketLimit(limit: Keyed<BucketRateLimit>, factor: number): ParsedLimit {
		if (limit.size < 1) throw new Error(`Invalid rate limit ${limit.key}: size is less than 1 (${limit.size})`);
		if (limit.dripRate != null && limit.dripRate < 1) throw new Error(`Invalid rate limit ${limit.key}: dripRate is less than 1 (${limit.dripRate})`);
		if (limit.dripSize != null && limit.dripSize < 1) throw new Error(`Invalid rate limit ${limit.key}: dripSize is less than 1 (${limit.dripSize})`);

		// 0 - Calculate
		const now = this.timeService.now;
		const bucketSize = Math.max(Math.ceil(limit.size / factor), 1);
		const dripRate = Math.ceil((limit.dripRate ?? 1000) * factor);
		const dripSize = Math.ceil(limit.dripSize ?? 1);
		const fullResetMs = dripRate * Math.ceil(bucketSize / dripSize);
		const fullResetSec = Math.max(Math.ceil(fullResetMs / 1000), 1);

		return {
			key: limit.key,
			now,
			bucketSize,
			dripRate,
			dripSize,
			fullResetMs,
			fullResetSec,
		};
	}

	/**
	 * Implementation of Leaky Bucket rate limiting - see SkRateLimiterService.md for details.
	 */
	private async limitBucket(limit: ParsedLimit, actor: string): Promise<LimitInfo> {
		// 0 - Calculate (extracted to other function)
		const { now, bucketSize, dripRate, dripSize } = limit;
		const expirationSec = limit.fullResetSec;

		// 1 - Read
		const counterKey = createLimitKey(limit, actor, 'c');
		const timestampKey = createLimitKey(limit, actor, 't');
		const counter = await this.getLimitCounter(counterKey, timestampKey);

		// 2 - Drip
		const dripsSinceLastTick = Math.floor((now - counter.timestamp) / dripRate) * dripSize;
		const deltaCounter = Math.min(dripsSinceLastTick, counter.counter);
		const deltaTimestamp = dripsSinceLastTick * dripRate;
		if (deltaCounter > 0) {
			// Execute the next drip(s)
			const results = await this.executeRedisMulti(
				['get', timestampKey],
				['incrby', timestampKey, deltaTimestamp],
				['expire', timestampKey, expirationSec],
				['get', timestampKey],
				['decrby', counterKey, deltaCounter],
				['expire', counterKey, expirationSec],
				['get', counterKey],
			);
			const expectedTimestamp = counter.timestamp;
			const canaryTimestamp = results[0] ? parseInt(results[0]) : 0;
			counter.timestamp = results[3] ? parseInt(results[3]) : 0;
			counter.counter = results[6] ? parseInt(results[6]) : 0;

			// Check for a data collision and rollback
			if (canaryTimestamp !== expectedTimestamp) {
				const rollbackResults = await this.executeRedisMulti(
					['decrby', timestampKey, deltaTimestamp],
					['get', timestampKey],
					['incrby', counterKey, deltaCounter],
					['get', counterKey],
				);
				counter.timestamp = rollbackResults[1] ? parseInt(rollbackResults[1]) : 0;
				counter.counter = rollbackResults[3] ? parseInt(rollbackResults[3]) : 0;
			}
		}

		// 3 - Check
		const blocked = counter.counter >= bucketSize;
		if (!blocked) {
			if (counter.timestamp === 0) {
				const results = await this.executeRedisMulti(
					['set', timestampKey, now],
					['expire', timestampKey, expirationSec],
					['incr', counterKey],
					['expire', counterKey, expirationSec],
					['get', counterKey],
				);
				counter.timestamp = now;
				counter.counter = results[4] ? parseInt(results[4]) : 0;
			} else {
				const results = await this.executeRedisMulti(
					['incr', counterKey],
					['expire', counterKey, expirationSec],
					['get', counterKey],
				);
				counter.counter = results[2] ? parseInt(results[2]) : 0;
			}
		}

		// Calculate how much time is needed to free up a bucket slot
		const overflow = Math.max((counter.counter + 1) - bucketSize, 0);
		const dripsNeeded = Math.ceil(overflow / dripSize);
		const timeNeeded = Math.max((dripRate * dripsNeeded) - (this.timeService.now - counter.timestamp), 0);

		// Calculate limit status
		const remaining = Math.max(bucketSize - counter.counter, 0);
		const resetMs = timeNeeded;
		const resetSec = Math.ceil(resetMs / 1000);
		const fullResetMs = Math.ceil(counter.counter / dripSize) * dripRate;
		const fullResetSec = Math.ceil(fullResetMs / 1000);
		return { blocked, remaining, resetSec, resetMs, fullResetSec, fullResetMs };
	}

	private async getLimitCounter(counterKey: string, timestampKey: string): Promise<LimitCounter> {
		const [counter, timestamp] = await this.executeRedisMulti(
			['get', counterKey],
			['get', timestampKey],
		);

		return {
			counter: counter ? parseInt(counter) : 0,
			timestamp: timestamp ? parseInt(timestamp) : 0,
		};
	}

	private async executeRedisMulti(...batch: RedisCommand[]): Promise<RedisResult[]> {
		const results = await this.redisClient.multi(batch).exec();

		// Transaction conflict (retryable)
		if (!results) {
			throw new ConflictError('Redis error: transaction conflict');
		}

		// Transaction failed (fatal)
		if (results.length !== batch.length) {
			throw new Error('Redis error: failed to execute batch');
		}

		// Map responses
		const errors: Error[] = [];
		const responses: RedisResult[] = [];
		for (const [error, response] of results) {
			if (error) errors.push(error);
			responses.push(response as RedisResult);
		}

		// Command failed (fatal)
		if (errors.length > 0) {
			const errorMessages = errors
				.map((e, i) => `Error in command ${i}: ${e}`)
				.join('\', \'');
			throw new AggregateError(errors, `Redis error: failed to execute command(s): '${errorMessages}'`);
		}

		return responses;
	}

	private incrementOverflow(actorKey: string, limit: ParsedLimit): LimitInfo | null {
		const oldCount = this.requestCounts.get(actorKey) ?? 0;

		if (oldCount >= limit.bucketSize) {
			// Overflow, pre-emptively reject the request
			return {
				blocked: true,
				remaining: 0,
				resetMs: limit.fullResetMs,
				resetSec: limit.fullResetSec,
				fullResetMs: limit.fullResetMs,
				fullResetSec: limit.fullResetSec,
			};
		}

		// No overflow, increment and continue to redis
		this.requestCounts.set(actorKey, oldCount + 1);
		return null;
	}

	private decrementOverflow(actorKey: string): void {
		const count = this.requestCounts.get(actorKey);
		if (count) {
			if (count > 1) {
				this.requestCounts.set(actorKey, count - 1);
			} else {
				this.requestCounts.delete(actorKey);
			}
		}
	}
}

// Not correct, but good enough for the basic commands we use.
type RedisResult = string | null;
type RedisCommand = [command: string, ...args: unknown[]];

function createLimitKey(limit: ParsedLimit, actor: string, value: string): string {
	return `rl_${actor}_${limit.key}_${value}`;
}

export class ConflictError extends Error {}

interface LimitCounter {
	timestamp: number;
	counter: number;
}
