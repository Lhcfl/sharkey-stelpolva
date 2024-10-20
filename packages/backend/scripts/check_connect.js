/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Redis from 'ioredis';
import { loadConfig } from '../built/config.js';
import { createPostgresDataSource } from '../built/postgres.js';

const config = loadConfig();

// createPostgresDataSource handels primaries and replicas automatically.
// usually, it only opens connections first use, so we force it using
// .initialize()
createPostgresDataSource(config)
	.initialize()
	.then(c => { c.destroy() })
	.catch(e => { throw e });


// Connect to all redis servers
function connectToRedis(redisOptions) {
	const redis = new Redis(redisOptions);
	redis.on('connect', () => redis.disconnect());
	redis.on('error', (e) => {
		throw e;
	});
}

// If not all of these are defined, the default one gets reused.
// so we use a Set to only try connecting once to each **uniq** redis.
(new Set([
	config.redis,
	config.redisForPubsub,
	config.redisForJobQueue,
	config.redisForTimelines,
	config.redisForReactions,
])).forEach(connectToRedis);
