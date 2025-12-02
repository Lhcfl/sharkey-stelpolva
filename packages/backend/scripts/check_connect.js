/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Redis from 'ioredis';
import { loadConfig } from '../built/config.js';
import { createPostgresDataSource } from '../built/postgres.js';
import { LoggerService } from '../built/core/LoggerService.js';
import { NativeTimeService } from '../built/global/TimeService.js';
import { EnvService } from '../built/global/EnvService.js';

const loggerService = new LoggerService(console, new NativeTimeService(), new EnvService());
const config = loadConfig(loggerService);

// createPostgresDataSource handles primaries and replicas automatically.
// usually, it only opens connections first use, so we force it using
// .initialize()
async function connectToPostgres() {
	const source = createPostgresDataSource(config, loggerService);
	await source.initialize();
	await source.destroy();
}

// Connect to all redis servers
async function connectToRedis(redisOptions) {
	return await new Promise(async (resolve, reject) => {
		const redis = new Redis({
			...redisOptions,
			lazyConnect: true,
			reconnectOnError: false,
			showFriendlyErrorStack: true,
		});
		redis.on('error', e => reject(e));

		try {
			await redis.connect();
			resolve();
		} catch (e) {
			reject(e);
		} finally {
			redis.disconnect(false);
		}
	});
}

// If not all of these are defined, the default one gets reused.
// so we use a Set to only try connecting once to each **uniq** redis.
const promises = Array
	.from(new Set([
		config.redis,
		config.redisForPubsub,
		config.redisForJobQueue,
		config.redisForTimelines,
		config.redisForReactions,
		config.redisForRateLimit,
	]))
	.map(connectToRedis)
	.concat([
		connectToPostgres()
	]);

await Promise.all(promises);
