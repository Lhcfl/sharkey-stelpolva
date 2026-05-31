import { Redis } from 'ioredis';

/**
 * This prevents hitting rate limit when login.
 */
export async function purgeLimit(host: string, client: Redis) {
	// Find all rate limit keys
	const keys: string[] = [];
	let cursor = '0';
	let batch: string[] = [];
	do {
		[cursor, batch] = await client.scan(cursor, 'MATCH', `${host}:limit:*:signin`);
		keys.push(...batch);
	} while (cursor !== '0');

	// Clear them
	if (keys.length > 0) {
		await client.del(keys);
	}
}

console.log('Daemon started running');

{
	const redisClient = new Redis({
		host: 'redis.test',
	});

	setInterval(() => {
		purgeLimit('a.test', redisClient);
		purgeLimit('b.test', redisClient);
	}, 200);
}
