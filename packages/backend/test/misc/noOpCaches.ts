/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Redis from 'ioredis';
import { Inject } from '@nestjs/common';
import { FakeInternalEventService } from './FakeInternalEventService.js';
import type { BlockingsRepository, FollowingsRepository, MiUser, MutingsRepository, NoteThreadMutingsRepository, RenoteMutingsRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import { MemoryKVCache, MemorySingleCache, RedisKVCache, RedisSingleCache } from '@/misc/cache.js';
import { QuantumKVCache, QuantumKVOpts } from '@/misc/QuantumKVCache.js';
import { CacheService, FollowStats } from '@/core/CacheService.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { InternalEventService } from '@/core/InternalEventService.js';

export function noOpRedis() {
	return {
		set: () => Promise.resolve(),
		get: () => Promise.resolve(null),
		del: () => Promise.resolve(),
		on: () => {},
		off: () => {},
	} as unknown as Redis.Redis;
}

export class NoOpCacheService extends CacheService {
	public readonly fakeRedis: {
		[K in keyof Redis.Redis]: Redis.Redis[K];
	};
	public readonly fakeInternalEventService: FakeInternalEventService;

	constructor(
		@Inject(DI.usersRepository)
		usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		userProfilesRepository: UserProfilesRepository,

		@Inject(DI.mutingsRepository)
		mutingsRepository: MutingsRepository,

		@Inject(DI.blockingsRepository)
		blockingsRepository: BlockingsRepository,

		@Inject(DI.renoteMutingsRepository)
		renoteMutingsRepository: RenoteMutingsRepository,

		@Inject(DI.followingsRepository)
		followingsRepository: FollowingsRepository,

		@Inject(DI.noteThreadMutingsRepository)
		noteThreadMutingsRepository: NoteThreadMutingsRepository,

		@Inject(UserEntityService)
		userEntityService: UserEntityService,
	) {
		const fakeRedis = noOpRedis();
		const fakeInternalEventService = new FakeInternalEventService();

		super(
			fakeRedis,
			fakeRedis,
			usersRepository,
			userProfilesRepository,
			mutingsRepository,
			blockingsRepository,
			renoteMutingsRepository,
			followingsRepository,
			noteThreadMutingsRepository,
			userEntityService,
			fakeInternalEventService,
		);

		this.fakeRedis = fakeRedis;
		this.fakeInternalEventService = fakeInternalEventService;

		// Override caches
		this.userByIdCache = new NoOpMemoryKVCache<MiUser>();
		this.localUserByNativeTokenCache = new NoOpMemoryKVCache<MiLocalUser | null>();
		this.localUserByIdCache = new NoOpMemoryKVCache<MiLocalUser>();
		this.uriPersonCache = new NoOpMemoryKVCache<MiUser | null>();
		this.userProfileCache = NoOpQuantumKVCache.copy(this.userProfileCache, fakeInternalEventService);
		this.userMutingsCache = NoOpQuantumKVCache.copy(this.userMutingsCache, fakeInternalEventService);
		this.userBlockingCache = NoOpQuantumKVCache.copy(this.userBlockingCache, fakeInternalEventService);
		this.userBlockedCache = NoOpQuantumKVCache.copy(this.userBlockedCache, fakeInternalEventService);
		this.renoteMutingsCache = NoOpQuantumKVCache.copy(this.renoteMutingsCache, fakeInternalEventService);
		this.threadMutingsCache = NoOpQuantumKVCache.copy(this.threadMutingsCache, fakeInternalEventService);
		this.noteMutingsCache = NoOpQuantumKVCache.copy(this.noteMutingsCache, fakeInternalEventService);
		this.userFollowingsCache = NoOpQuantumKVCache.copy(this.userFollowingsCache, fakeInternalEventService);
		this.userFollowersCache = NoOpQuantumKVCache.copy(this.userFollowersCache, fakeInternalEventService);
		this.hibernatedUserCache = NoOpQuantumKVCache.copy(this.hibernatedUserCache, fakeInternalEventService);
		this.userFollowStatsCache = new NoOpMemoryKVCache<FollowStats>();
		this.translationsCache = NoOpRedisKVCache.copy(this.translationsCache, fakeRedis);
	}
}

export class NoOpMemoryKVCache<T> extends MemoryKVCache<T> {
	constructor() {
		super(-1);
	}
}

export class NoOpMemorySingleCache<T> extends MemorySingleCache<T> {
	constructor() {
		super(-1);
	}
}

export class NoOpRedisKVCache<T> extends RedisKVCache<T> {
	constructor(opts?: {
		redis?: Redis.Redis;
		fetcher?: RedisKVCache<T>['fetcher'];
		toRedisConverter?: RedisKVCache<T>['toRedisConverter'];
		fromRedisConverter?: RedisKVCache<T>['fromRedisConverter'];
	}) {
		super(
			opts?.redis ?? noOpRedis(),
			'no-op',
			{
				lifetime: -1,
				memoryCacheLifetime: -1,
				fetcher: opts?.fetcher,
				toRedisConverter: opts?.toRedisConverter,
				fromRedisConverter: opts?.fromRedisConverter,
			},
		);
	}

	public static copy<T>(cache: RedisKVCache<T>, redis?: Redis.Redis): NoOpRedisKVCache<T> {
		return new NoOpRedisKVCache<T>({
			redis,
			fetcher: cache.fetcher,
			toRedisConverter: cache.toRedisConverter,
			fromRedisConverter: cache.fromRedisConverter,
		});
	}
}

export class NoOpRedisSingleCache<T> extends RedisSingleCache<T> {
	constructor(opts?: {
		redis?: Redis.Redis;
		fetcher?: RedisSingleCache<T>['fetcher'];
		toRedisConverter?: RedisSingleCache<T>['toRedisConverter'];
		fromRedisConverter?: RedisSingleCache<T>['fromRedisConverter'];
	}) {
		super(
			opts?.redis ?? noOpRedis(),
			'no-op',
			{
				lifetime: -1,
				memoryCacheLifetime: -1,
				fetcher: opts?.fetcher,
				toRedisConverter: opts?.toRedisConverter,
				fromRedisConverter: opts?.fromRedisConverter,
			},
		);
	}

	public static copy<T>(cache: RedisSingleCache<T>, redis?: Redis.Redis): NoOpRedisSingleCache<T> {
		return new NoOpRedisSingleCache<T>({
			redis,
			fetcher: cache.fetcher,
			toRedisConverter: cache.toRedisConverter,
			fromRedisConverter: cache.fromRedisConverter,
		});
	}
}

export class NoOpQuantumKVCache<T> extends QuantumKVCache<T> {
	constructor(opts: Omit<QuantumKVOpts<T>, 'lifetime'> & {
		internalEventService?: InternalEventService,
	}) {
		super(
			opts.internalEventService ?? new FakeInternalEventService(),
			'no-op',
			{
				...opts,
				lifetime: -1,
			},
		);
	}

	public static copy<T>(cache: QuantumKVCache<T>, internalEventService?: InternalEventService): NoOpQuantumKVCache<T> {
		return new NoOpQuantumKVCache<T>({
			internalEventService,
			fetcher: cache.fetcher,
			bulkFetcher: cache.bulkFetcher,
			onChanged: cache.onChanged,
		});
	}
}
