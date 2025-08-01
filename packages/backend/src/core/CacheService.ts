/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { In, IsNull } from 'typeorm';
import { _ } from 'ajv';
import type { BlockingsRepository, FollowingsRepository, MutingsRepository, RenoteMutingsRepository, MiUserProfile, UserProfilesRepository, UsersRepository, MiNote, MiFollowing, NoteThreadMutingsRepository } from '@/models/_.js';
import { MemoryKVCache, RedisKVCache } from '@/misc/cache.js';
import { QuantumKVCache } from '@/misc/QuantumKVCache.js';
import type { MiLocalUser, MiRemoteUser, MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import type { InternalEventTypes } from '@/core/GlobalEventService.js';
import { InternalEventService } from '@/core/InternalEventService.js';
import type { Config } from '@/config.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import type { OnApplicationShutdown } from '@nestjs/common';

type StpvRemoteUserDecorationsCacheType = {
	id: string;
	angle?: number;
	flipH?: boolean;
	offsetX?: number;
	offsetY?: number;
	url?: string;
	showBelow?: boolean;
}[];
export interface FollowStats {
	localFollowing: number;
	localFollowers: number;
	remoteFollowing: number;
	remoteFollowers: number;
}

export interface CachedTranslation {
	sourceLang: string | undefined;
	text: string | undefined;
}

export interface CachedTranslationEntity {
	l?: string;
	t?: string;
	u?: number;
}

@Injectable()
export class CacheService implements OnApplicationShutdown {
	public userByIdCache: MemoryKVCache<MiUser>;
	public localUserByNativeTokenCache: MemoryKVCache<MiLocalUser | null>;
	public localUserByIdCache: MemoryKVCache<MiLocalUser>;
	public uriPersonCache: MemoryKVCache<MiUser | null>;
	public userProfileCache: QuantumKVCache<MiUserProfile>;
	public userMutingsCache: QuantumKVCache<Set<string>>;
	public userBlockingCache: QuantumKVCache<Set<string>>;
	public userBlockedCache: QuantumKVCache<Set<string>>; // NOTE: 「被」Blockキャッシュ
	public renoteMutingsCache: QuantumKVCache<Set<string>>;
	public threadMutingsCache: QuantumKVCache<Set<string>>;
	public noteMutingsCache: QuantumKVCache<Set<string>>;
	public userFollowingsCache: QuantumKVCache<Map<string, Omit<MiFollowing, 'isFollowerHibernated'>>>;
	public userFollowersCache: QuantumKVCache<Map<string, Omit<MiFollowing, 'isFollowerHibernated'>>>;
	public hibernatedUserCache: QuantumKVCache<boolean>;
	public stpvRemoteUserDecorationsCache: RedisKVCache<StpvRemoteUserDecorationsCacheType>;
	protected userFollowStatsCache = new MemoryKVCache<FollowStats>(1000 * 60 * 10); // 10 minutes
	protected translationsCache: RedisKVCache<CachedTranslationEntity>;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		@Inject(DI.blockingsRepository)
		private blockingsRepository: BlockingsRepository,

		@Inject(DI.renoteMutingsRepository)
		private renoteMutingsRepository: RenoteMutingsRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.config)
		private config: Config,
		@Inject(DI.noteThreadMutingsRepository)
		private readonly noteThreadMutingsRepository: NoteThreadMutingsRepository,

		private userEntityService: UserEntityService,
		private readonly internalEventService: InternalEventService,
		private httpRequestService: HttpRequestService,
	) {
		//this.onMessage = this.onMessage.bind(this);

		this.userByIdCache = new MemoryKVCache<MiUser>(1000 * 60 * 5); // 5m
		this.localUserByNativeTokenCache = new MemoryKVCache<MiLocalUser | null>(1000 * 60 * 5); // 5m
		this.localUserByIdCache = new MemoryKVCache<MiLocalUser>(1000 * 60 * 5); // 5m
		this.uriPersonCache = new MemoryKVCache<MiUser | null>(1000 * 60 * 5); // 5m

		this.userProfileCache = new QuantumKVCache(this.internalEventService, 'userProfile', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: (key) => this.userProfilesRepository.findOneByOrFail({ userId: key }),
			bulkFetcher: userIds => this.userProfilesRepository.findBy({ userId: In(userIds) }).then(ps => ps.map(p => [p.userId, p])),
		});

		this.userMutingsCache = new QuantumKVCache<Set<string>>(this.internalEventService, 'userMutings', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: (key) => this.mutingsRepository.find({ where: { muterId: key }, select: ['muteeId'] }).then(xs => new Set(xs.map(x => x.muteeId))),
			bulkFetcher: muterIds => this.mutingsRepository
				.createQueryBuilder('muting')
				.select('"muting"."muterId"', 'muterId')
				.addSelect('array_agg("muting"."muteeId")', 'muteeIds')
				.where({ muterId: In(muterIds) })
				.groupBy('muting.muterId')
				.getRawMany<{ muterId: string, muteeIds: string[] }>()
				.then(ms => ms.map(m => [m.muterId, new Set(m.muteeIds)])),
		});

		this.userBlockingCache = new QuantumKVCache<Set<string>>(this.internalEventService, 'userBlocking', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: (key) => this.blockingsRepository.find({ where: { blockerId: key }, select: ['blockeeId'] }).then(xs => new Set(xs.map(x => x.blockeeId))),
			bulkFetcher: blockerIds => this.blockingsRepository
				.createQueryBuilder('blocking')
				.select('"blocking"."blockerId"', 'blockerId')
				.addSelect('array_agg("blocking"."blockeeId")', 'blockeeIds')
				.where({ blockerId: In(blockerIds) })
				.groupBy('blocking.blockerId')
				.getRawMany<{ blockerId: string, blockeeIds: string[] }>()
				.then(ms => ms.map(m => [m.blockerId, new Set(m.blockeeIds)])),
		});

		this.userBlockedCache = new QuantumKVCache<Set<string>>(this.internalEventService, 'userBlocked', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: (key) => this.blockingsRepository.find({ where: { blockeeId: key }, select: ['blockerId'] }).then(xs => new Set(xs.map(x => x.blockerId))),
			bulkFetcher: blockeeIds => this.blockingsRepository
				.createQueryBuilder('blocking')
				.select('"blocking"."blockeeId"', 'blockeeId')
				.addSelect('array_agg("blocking"."blockeeId")', 'blockeeIds')
				.where({ blockeeId: In(blockeeIds) })
				.groupBy('blocking.blockeeId')
				.getRawMany<{ blockeeId: string, blockerIds: string[] }>()
				.then(ms => ms.map(m => [m.blockeeId, new Set(m.blockerIds)])),
		});

		this.renoteMutingsCache = new QuantumKVCache<Set<string>>(this.internalEventService, 'renoteMutings', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: (key) => this.renoteMutingsRepository.find({ where: { muterId: key }, select: ['muteeId'] }).then(xs => new Set(xs.map(x => x.muteeId))),
			bulkFetcher: muterIds => this.renoteMutingsRepository
				.createQueryBuilder('muting')
				.select('"muting"."muterId"', 'muterId')
				.addSelect('array_agg("muting"."muteeId")', 'muteeIds')
				.where({ muterId: In(muterIds) })
				.groupBy('muting.muterId')
				.getRawMany<{ muterId: string, muteeIds: string[] }>()
				.then(ms => ms.map(m => [m.muterId, new Set(m.muteeIds)])),
		});

		this.threadMutingsCache = new QuantumKVCache<Set<string>>(this.internalEventService, 'threadMutings', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: muterId => this.noteThreadMutingsRepository
				.find({ where: { userId: muterId, isPostMute: false }, select: { threadId: true } })
				.then(ms => new Set(ms.map(m => m.threadId))),
			bulkFetcher: muterIds => this.noteThreadMutingsRepository
				.createQueryBuilder('muting')
				.select('"muting"."userId"', 'userId')
				.addSelect('array_agg("muting"."threadId")', 'threadIds')
				.groupBy('"muting"."userId"')
				.where({ userId: In(muterIds), isPostMute: false })
				.getRawMany<{ userId: string, threadIds: string[] }>()
				.then(ms => ms.map(m => [m.userId, new Set(m.threadIds)])),
		});

		this.noteMutingsCache = new QuantumKVCache<Set<string>>(this.internalEventService, 'noteMutings', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: muterId => this.noteThreadMutingsRepository
				.find({ where: { userId: muterId, isPostMute: true }, select: { threadId: true } })
				.then(ms => new Set(ms.map(m => m.threadId))),
			bulkFetcher: muterIds => this.noteThreadMutingsRepository
				.createQueryBuilder('muting')
				.select('"muting"."userId"', 'userId')
				.addSelect('array_agg("muting"."threadId")', 'threadIds')
				.groupBy('"muting"."userId"')
				.where({ userId: In(muterIds), isPostMute: true })
				.getRawMany<{ userId: string, threadIds: string[] }>()
				.then(ms => ms.map(m => [m.userId, new Set(m.threadIds)])),
		});

		this.userFollowingsCache = new QuantumKVCache<Map<string, Omit<MiFollowing, 'isFollowerHibernated'>>>(this.internalEventService, 'userFollowings', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: (key) => this.followingsRepository.findBy({ followerId: key }).then(xs => new Map(xs.map(f => [f.followeeId, f]))),
			bulkFetcher: followerIds => this.followingsRepository
				.findBy({ followerId: In(followerIds) })
				.then(fs => fs
					.reduce((groups, f) => {
						let group = groups.get(f.followerId);
						if (!group) {
							group = new Map();
							groups.set(f.followerId, group);
						}
						group.set(f.followeeId, f);
						return groups;
					}, new Map<string, Map<string, Omit<MiFollowing, 'isFollowerHibernated'>>>)),
		});

		this.userFollowersCache = new QuantumKVCache<Map<string, Omit<MiFollowing, 'isFollowerHibernated'>>>(this.internalEventService, 'userFollowers', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: followeeId => this.followingsRepository.findBy({ followeeId: followeeId }).then(xs => new Map(xs.map(x => [x.followerId, x]))),
			bulkFetcher: followeeIds => this.followingsRepository
				.findBy({ followeeId: In(followeeIds) })
				.then(fs => fs
					.reduce((groups, f) => {
						let group = groups.get(f.followeeId);
						if (!group) {
							group = new Map();
							groups.set(f.followeeId, group);
						}
						group.set(f.followerId, f);
						return groups;
					}, new Map<string, Map<string, Omit<MiFollowing, 'isFollowerHibernated'>>>)),
		});

		this.hibernatedUserCache = new QuantumKVCache<boolean>(this.internalEventService, 'hibernatedUsers', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async userId => {
				const { isHibernated } = await this.usersRepository.findOneOrFail({
					where: { id: userId },
					select: { isHibernated: true },
				});
				return isHibernated;
			},
			bulkFetcher: async userIds => {
				const results = await this.usersRepository.find({
					where: { id: In(userIds) },
					select: { id: true, isHibernated: true },
				});
				return results.map(({ id, isHibernated }) => [id, isHibernated]);
			},
			onChanged: async userIds => {
				// We only update local copies since each process will get this event, but we can have user objects in multiple different caches.
				// Before doing anything else we must "find" all the objects to update.
				const userObjects = new Map<string, MiUser[]>();
				const toUpdate: string[] = [];
				for (const uid of userIds) {
					const toAdd: MiUser[] = [];

					const localUserById = this.localUserByIdCache.get(uid);
					if (localUserById) toAdd.push(localUserById);

					const userById = this.userByIdCache.get(uid);
					if (userById) toAdd.push(userById);

					if (toAdd.length > 0) {
						toUpdate.push(uid);
						userObjects.set(uid, toAdd);
					}
				}

				// In many cases, we won't have to do anything.
				// Skipping the DB fetch ensures that this remains a single-step synchronous process.
				if (toUpdate.length > 0) {
					const hibernations = await this.usersRepository.find({ where: { id: In(toUpdate) }, select: { id: true, isHibernated: true } });
					for (const { id, isHibernated } of hibernations) {
						const users = userObjects.get(id);
						if (users) {
							for (const u of users) {
								u.isHibernated = isHibernated;
							}
						}
					}
				}
			},
		});

		// cache remote user's avatar decorations
		this.stpvRemoteUserDecorationsCache = new RedisKVCache<StpvRemoteUserDecorationsCacheType>(this.redisClient, 'stpvRemoteUserDecorationsCache', {
			lifetime: 1000 * 60 * 30, // 30m
			memoryCacheLifetime: 1000 * 60, // 1m
			fetcher: (key) => this.userByIdCache.fetch(key, () => this.usersRepository.findOneBy({
				id: key,
			}) as Promise<MiLocalUser>).then(user => {
				if (user.host == null) return [];
				if (!(this.config.avatarDecorationAllowedHosts?.includes(user.host))) return [];
				return this.httpRequestService.send(`https://${user.host}/api/users/show`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						host: null,
						username: user.username,
					}),
				}).then(res => res.json() as { avatarDecorations?: StpvRemoteUserDecorationsCacheType })
					.then((res) =>
						res.avatarDecorations?.filter(ad => ad.url).map((ad) => ({
							id: `${ad.id}:${user.host}`,
							angle: ad.angle ? Number(ad.angle) : undefined,
							offsetX: ad.offsetX ? Number(ad.offsetX) : undefined,
							offsetY: ad.offsetY ? Number(ad.offsetY) : undefined,
							flipH: ad.flipH ? Boolean(ad.flipH) : undefined,
							showBelow: ad.showBelow ? Boolean(ad.showBelow) : undefined,
							url: ad.url,
						})) ?? [],
					)
					.catch((err) => {
						console.error(err);
						return [];
					});
			}),
			toRedisConverter: (value) => JSON.stringify(value),
			fromRedisConverter: (value) => JSON.parse(value),
		});

		this.translationsCache = new RedisKVCache<CachedTranslationEntity>(this.redisClient, 'translations', {
			lifetime: 1000 * 60 * 60 * 24 * 7, // 1 week,
			memoryCacheLifetime: 1000 * 60, // 1 minute
		});

		// NOTE: チャンネルのフォロー状況キャッシュはChannelFollowingServiceで行っている

		this.internalEventService.on('userChangeSuspendedState', this.onUserEvent);
		this.internalEventService.on('userChangeDeletedState', this.onUserEvent);
		this.internalEventService.on('remoteUserUpdated', this.onUserEvent);
		this.internalEventService.on('localUserUpdated', this.onUserEvent);
		this.internalEventService.on('userChangeSuspendedState', this.onUserEvent);
		this.internalEventService.on('userTokenRegenerated', this.onTokenEvent);
		this.internalEventService.on('follow', this.onFollowEvent);
		this.internalEventService.on('unfollow', this.onFollowEvent);
	}

	@bindThis
	private async onUserEvent<E extends 'userChangeSuspendedState' | 'userChangeDeletedState' | 'remoteUserUpdated' | 'localUserUpdated'>(body: InternalEventTypes[E], _: E, isLocal: boolean): Promise<void> {
		{
			{
				{
					const user = await this.usersRepository.findOneBy({ id: body.id });
					if (user == null) {
						this.userByIdCache.delete(body.id);
						this.localUserByIdCache.delete(body.id);
						for (const [k, v] of this.uriPersonCache.entries) {
							if (v.value?.id === body.id) {
								this.uriPersonCache.delete(k);
							}
						}
						if (isLocal) {
							await Promise.all([
								this.userProfileCache.delete(body.id),
								this.userMutingsCache.delete(body.id),
								this.userBlockingCache.delete(body.id),
								this.userBlockedCache.delete(body.id),
								this.renoteMutingsCache.delete(body.id),
								this.userFollowingsCache.delete(body.id),
								this.userFollowersCache.delete(body.id),
								this.hibernatedUserCache.delete(body.id),
								this.threadMutingsCache.delete(body.id),
								this.noteMutingsCache.delete(body.id),
							]);
						}
					} else {
						this.userByIdCache.set(user.id, user);
						for (const [k, v] of this.uriPersonCache.entries) {
							if (v.value?.id === user.id) {
								this.uriPersonCache.set(k, user);
							}
						}
						if (this.userEntityService.isLocalUser(user)) {
							this.localUserByNativeTokenCache.set(user.token!, user);
							this.localUserByIdCache.set(user.id, user);
						}
					}
				}
			}
		}
	}

	@bindThis
	private async onTokenEvent<E extends 'userTokenRegenerated'>(body: InternalEventTypes[E]): Promise<void> {
		{
			{
				{
					const user = await this.usersRepository.findOneByOrFail({ id: body.id }) as MiLocalUser;
					this.localUserByNativeTokenCache.delete(body.oldToken);
					this.localUserByNativeTokenCache.set(body.newToken, user);
				}
			}
		}
	}

	@bindThis
	private async onFollowEvent<E extends 'follow' | 'unfollow'>(body: InternalEventTypes[E], type: E): Promise<void> {
		{
			switch (type) {
				case 'follow': {
					const follower = this.userByIdCache.get(body.followerId);
					if (follower) follower.followingCount++;
					const followee = this.userByIdCache.get(body.followeeId);
					if (followee) followee.followersCount++;
					await Promise.all([
						this.userFollowingsCache.delete(body.followerId),
						this.userFollowersCache.delete(body.followeeId),
					]);
					this.userFollowStatsCache.delete(body.followerId);
					this.userFollowStatsCache.delete(body.followeeId);
					break;
				}
				case 'unfollow': {
					const follower = this.userByIdCache.get(body.followerId);
					if (follower) follower.followingCount--;
					const followee = this.userByIdCache.get(body.followeeId);
					if (followee) followee.followersCount--;
					await Promise.all([
						this.userFollowingsCache.delete(body.followerId),
						this.userFollowersCache.delete(body.followeeId),
					]);
					this.userFollowStatsCache.delete(body.followerId);
					this.userFollowStatsCache.delete(body.followeeId);
					break;
				}
			}
		}
	}

	@bindThis
	public findUserById(userId: MiUser['id']) {
		return this.userByIdCache.fetch(userId, () => this.usersRepository.findOneByOrFail({ id: userId }));
	}

	@bindThis
	public async findLocalUserById(userId: MiUser['id']): Promise<MiLocalUser | null> {
		return await this.localUserByIdCache.fetchMaybe(userId, async () => {
			return await this.usersRepository.findOneBy({ id: userId, host: IsNull() }) as MiLocalUser | null ?? undefined;
		}) ?? null;
	}

	@bindThis
	public async findRemoteUserById(userId: MiUser['id']): Promise<MiRemoteUser | null> {
		const user = await this.findUserById(userId);

		if (user.host == null) {
			return null;
		}

		return user as MiRemoteUser;
	}

	@bindThis
	public findOptionalUserById(userId: MiUser['id']) {
		return this.userByIdCache.fetchMaybe(userId, async () => await this.usersRepository.findOneBy({ id: userId }) ?? undefined);
	}

	@bindThis
	public async getFollowStats(userId: MiUser['id']): Promise<FollowStats> {
		return await this.userFollowStatsCache.fetch(userId, async () => {
			const stats = {
				localFollowing: 0,
				localFollowers: 0,
				remoteFollowing: 0,
				remoteFollowers: 0,
			};

			const followings = await this.followingsRepository.findBy([
				{ followerId: userId },
				{ followeeId: userId },
			]);

			for (const following of followings) {
				if (following.followerId === userId) {
					// increment following; user is a follower of someone else
					if (following.followeeHost == null) {
						stats.localFollowing++;
					} else {
						stats.remoteFollowing++;
					}
				} else if (following.followeeId === userId) {
					// increment followers; user is followed by someone else
					if (following.followerHost == null) {
						stats.localFollowers++;
					} else {
						stats.remoteFollowers++;
					}
				} else {
					// Should never happen
				}
			}

			// Infer remote-remote followers heuristically, since we don't track that info directly.
			const user = await this.findUserById(userId);
			if (user.host !== null) {
				stats.remoteFollowing = Math.max(0, user.followingCount - stats.localFollowing);
				stats.remoteFollowers = Math.max(0, user.followersCount - stats.localFollowers);
			}

			return stats;
		});
	}

	@bindThis
	public async getCachedTranslation(note: MiNote, targetLang: string): Promise<CachedTranslation | null> {
		const cacheKey = `${note.id}@${targetLang}`;

		// Use cached translation, if present and up-to-date
		const cached = await this.translationsCache.get(cacheKey);
		if (cached && cached.u === note.updatedAt?.valueOf()) {
			return {
				sourceLang: cached.l,
				text: cached.t,
			};
		}

		// No cache entry :(
		return null;
	}

	@bindThis
	public async setCachedTranslation(note: MiNote, targetLang: string, translation: CachedTranslation): Promise<void> {
		const cacheKey = `${note.id}@${targetLang}`;

		await this.translationsCache.set(cacheKey, {
			l: translation.sourceLang,
			t: translation.text,
			u: note.updatedAt?.valueOf(),
		});
	}

	@bindThis
	public async getUsers(userIds: Iterable<string>): Promise<Map<string, MiUser>> {
		const users = new Map<string, MiUser>;

		const toFetch: string[] = [];
		for (const userId of userIds) {
			const fromCache = this.userByIdCache.get(userId);
			if (fromCache) {
				users.set(userId, fromCache);
			} else {
				toFetch.push(userId);
			}
		}

		if (toFetch.length > 0) {
			const fetched = await this.usersRepository.findBy({
				id: In(toFetch),
			});

			for (const user of fetched) {
				users.set(user.id, user);
				this.userByIdCache.set(user.id, user);
			}
		}

		return users;
	}

	@bindThis
	public async isFollowing(follower: string | { id: string }, followee: string | { id: string }): Promise<boolean> {
		const followerId = typeof(follower) === 'string' ? follower : follower.id;
		const followeeId = typeof(followee) === 'string' ? followee : followee.id;

		// This lets us use whichever one is in memory, falling back to DB fetch via userFollowingsCache.
		return this.userFollowersCache.get(followeeId)?.has(followerId)
		?? (await this.userFollowingsCache.fetch(followerId)).has(followeeId);
	}

	/**
	 * Returns all hibernated followers.
	 */
	@bindThis
	public async getHibernatedFollowers(followeeId: string): Promise<MiFollowing[]> {
		const followers = await this.getFollowersWithHibernation(followeeId);
		return followers.filter(f => f.isFollowerHibernated);
	}

	/**
	 * Returns all non-hibernated followers.
	 */
	@bindThis
	public async getNonHibernatedFollowers(followeeId: string): Promise<MiFollowing[]> {
		const followers = await this.getFollowersWithHibernation(followeeId);
		return followers.filter(f => !f.isFollowerHibernated);
	}

	/**
	 * Returns follower relations with populated isFollowerHibernated.
	 * If you don't need this field, then please use userFollowersCache directly for reduced overhead.
	 */
	@bindThis
	public async getFollowersWithHibernation(followeeId: string): Promise<MiFollowing[]> {
		const followers = await this.userFollowersCache.fetch(followeeId);
		const hibernations = await this.hibernatedUserCache.fetchMany(followers.keys()).then(fs => fs.reduce((map, f) => {
			map.set(f[0], f[1]);
			return map;
		}, new Map<string, boolean>));
		return Array.from(followers.values()).map(following => ({
			...following,
			isFollowerHibernated: hibernations.get(following.followerId) ?? false,
		}));
	}

	/**
	 * Refreshes follower and following relations for the given user.
	 */
	@bindThis
	public async refreshFollowRelationsFor(userId: string): Promise<void> {
		const followings = await this.userFollowingsCache.refresh(userId);
		const followees = Array.from(followings.values()).map(f => f.followeeId);
		await this.userFollowersCache.deleteMany(followees);
	}

	@bindThis
	public clear(): void {
		this.userByIdCache.clear();
		this.localUserByNativeTokenCache.clear();
		this.localUserByIdCache.clear();
		this.uriPersonCache.clear();
		this.userProfileCache.clear();
		this.userMutingsCache.clear();
		this.userBlockingCache.clear();
		this.userBlockedCache.clear();
		this.renoteMutingsCache.clear();
		this.userFollowingsCache.clear();
		this.userFollowStatsCache.clear();
		this.translationsCache.clear();
	}

	@bindThis
	public dispose(): void {
		this.internalEventService.off('userChangeSuspendedState', this.onUserEvent);
		this.internalEventService.off('userChangeDeletedState', this.onUserEvent);
		this.internalEventService.off('remoteUserUpdated', this.onUserEvent);
		this.internalEventService.off('localUserUpdated', this.onUserEvent);
		this.internalEventService.off('userChangeSuspendedState', this.onUserEvent);
		this.internalEventService.off('userTokenRegenerated', this.onTokenEvent);
		this.internalEventService.off('follow', this.onFollowEvent);
		this.internalEventService.off('unfollow', this.onFollowEvent);
		this.userByIdCache.dispose();
		this.localUserByNativeTokenCache.dispose();
		this.localUserByIdCache.dispose();
		this.uriPersonCache.dispose();
		this.userProfileCache.dispose();
		this.userMutingsCache.dispose();
		this.userBlockingCache.dispose();
		this.userBlockedCache.dispose();
		this.renoteMutingsCache.dispose();
		this.threadMutingsCache.dispose();
		this.noteMutingsCache.dispose();
		this.userFollowingsCache.dispose();
		this.userFollowersCache.dispose();
		this.hibernatedUserCache.dispose();
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
