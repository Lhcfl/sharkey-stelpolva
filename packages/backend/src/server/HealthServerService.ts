/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { Keyed, RateLimit, sendRateLimitHeaders } from '@/misc/rate-limit-utils.js';
import { SkRateLimiterService } from '@/server/SkRateLimiterService.js';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import { readyRef } from '@/boot/ready.js';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { MeiliSearch } from 'meilisearch';

// Up to 5 calls, then 1 per second
const healthRateLimit: Keyed<RateLimit> = {
	key: '/health',
	type: 'bucket',
	size: 5,
	dripRate: 1000,
};

@Injectable()
export class HealthServerService {
	constructor(
		@Inject(DI.redis)
		private redis: Redis.Redis,

		@Inject(DI.redisForPub)
		private redisForPub: Redis.Redis,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		@Inject(DI.redisForReactions)
		private redisForReactions: Redis.Redis,

		@Inject(DI.redisForRateLimit)
		private redisForRateLimit: Redis.Redis,

		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.meilisearch)
		private meilisearch: MeiliSearch | null,

		private readonly skRateLimiterService: SkRateLimiterService,
	) {}

	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.get('/', async (request, reply) => {
			reply.header('Cache-Control', 'no-store');

			try {
				// Rate limit to prevent DoS.
				// This is inside the try/catch block because it uses Redis, which may be offline.
				// If that happens, an exception is thrown - just like the actual test case below.
				const limitInfo = await this.skRateLimiterService.limit(healthRateLimit, request.ip);
				sendRateLimitHeaders(reply, limitInfo);
				if (limitInfo.blocked) {
					return reply.code(429).send();
				}

				// Ping all services
				await Promise.all([
					new Promise<void>((resolve, reject) => readyRef.value ? resolve() : reject()),
					this.redis.ping(),
					this.redisForPub.ping(),
					this.redisForSub.ping(),
					this.redisForTimelines.ping(),
					this.redisForReactions.ping(),
					this.redisForRateLimit.ping(),
					this.db.query('SELECT 1'),
					this.meilisearch ? this.meilisearch.health() : null,
				]);

				// If the previous call succeeds, then everything is online.
				return reply.code(200).send();
			} catch {
				// An exception will be thrown if any service is offline, so ignore it and return 503 (Service Unavailable).
				return reply.code(503).send();
			}
		});

		done();
	}
}
