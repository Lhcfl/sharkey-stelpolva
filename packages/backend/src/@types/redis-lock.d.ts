/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

declare module 'redis-lock' {
	export interface NodeRedis {
		readonly v4: true;
		set(key: string, value: string | number, opts?: { PX?: number, NX?: boolean }): Promise<'OK' | null>;
		del(key: string): Promise<number>;
	}

	export type Unlock = () => Promise<void>;
	export type Lock = (lockName: string, timeout?: number) => Promise<Unlock>;
	function redisLock(client: Redis.Redis, retryDelay: number): Lock;

	export = redisLock;
}
