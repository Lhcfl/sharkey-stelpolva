/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { promisify } from 'node:util';
import { Inject, Injectable } from '@nestjs/common';
import redisLock, { Unlock, NodeRedis } from 'redis-lock';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';

/**
 * Retry delay (ms) for lock acquisition
 */
const retryDelay = 100;

@Injectable()
export class AppLockService {
	private lock: (key: string, timeout?: number) => Promise<Unlock>;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,
	) {
		this.lock = redisLock(adaptRedis(this.redisClient), retryDelay);
	}

	/**
	 * Get AP Object lock
	 * @param uri AP object ID
	 * @param timeout Lock timeout (ms), The timeout releases previous lock.
	 * @returns Unlock function
	 */
	@bindThis
	public getApLock(uri: string, timeout = 30 * 1000): Promise<Unlock> {
		return this.lock(`ap-object:${uri}`, timeout);
	}

	@bindThis
	public getChartInsertLock(lockKey: string, timeout = 30 * 1000): Promise<Unlock> {
		return this.lock(`chart-insert:${lockKey}`, timeout);
	}
}

/**
 * Adapts an ioredis instance into something close enough to NodeRedis that it works with redis-lock.
 */
function adaptRedis(ioredis: Redis.Redis): NodeRedis {
	return {
		v4: true,
		async set(key: string, value: string | number, opts?: { PX?: number, NX?: boolean }) {
			if (opts) {
				if (opts.PX != null && opts.NX) {
					return ioredis.set(key, value, 'PX', opts.PX, 'NX');
				} else if (opts.PX != null) {
					return ioredis.set(key, value, 'PX', opts.PX);
				} else if (opts.NX) {
					return ioredis.set(key, value, 'NX');
				}
			}
			return ioredis.set(key, value);
		},
		async del(key: string) {
			return await ioredis.del(key);
		},
	};
}
