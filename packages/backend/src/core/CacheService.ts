/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors; originally based on code by syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In, IsNull, Brackets, MoreThan } from 'typeorm';
import type {
	BlockingsRepository,
	FollowingsRepository,
	MutingsRepository,
	RenoteMutingsRepository,
	MiUserProfile,
	UserProfilesRepository,
	UsersRepository,
	MiFollowing,
	NoteThreadMutingsRepository,
	ChannelFollowingsRepository,
	UserListMembershipsRepository,
	UserListFavoritesRepository,
} from '@/models/_.js';
import type { MiLocalUser, MiRemoteUser, MiUser } from '@/models/User.js';
import type { MiUserListMembership } from '@/models/UserListMembership.js';
import { isLocalUser, isRemoteUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { InternalEventTypes } from '@/core/GlobalEventService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import * as Acct from '@/misc/acct.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { TimeService } from '@/global/TimeService.js';
import {
	CacheManagementService,
	type ManagedMemoryKVCache,
	type ManagedQuantumKVCache,
} from '@/global/CacheManagementService.js';
import type { OnApplicationShutdown } from '@nestjs/common';
import type { Config } from '@/config.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';

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

@Injectable()
export class CacheService implements OnApplicationShutdown {
	/**
	 * Maps user IDs (key) to MiUser instances (value).
	 * This is the ONLY source for cached MiUser entities!
	 */
	public readonly userByIdCache: ManagedQuantumKVCache<MiUser>;

	/**
	 * Maps native tokens (key) to user IDs (value).
	 */
	public readonly nativeTokenCache: ManagedQuantumKVCache<string>;

	/**
	 * Maps acct handles (key) to user IDs (value).
	 */
	public readonly userByAcctCache: ManagedQuantumKVCache<string>;

	/**
	 * Maps user IDs (key) to MiUserProfile instances (value).
	 * This is the ONLY source for cached MiUserProfile entities!
	 */
	public readonly userProfileCache: ManagedQuantumKVCache<MiUserProfile>;

	/**
	 * Maps user IDs (key) to the set of user IDs (value) muted by that user.
	 */
	public readonly userMutingsCache: ManagedQuantumKVCache<Set<string>>;

	/**
	 * Maps user IDs (key) to the set of user IDs (value) muting that user.
	 */
	public readonly userMutedCache: ManagedQuantumKVCache<Set<string>>;

	/**
	 * Maps user IDs (key) to the set of user IDs (value) blocked by that user.
	 */
	public readonly userBlockingCache: ManagedQuantumKVCache<Set<string>>;

	/**
	 * Maps user IDs (key) to the set of user IDs (value) blocking that user.
	 */
	public readonly userBlockedCache: ManagedQuantumKVCache<Set<string>>;

	/**
	 * Maps user IDs (key) to the map of list ID / MiUserListMembership instances (value) for all lists containing this user.
	 */
	public readonly userListMembershipsCache: ManagedQuantumKVCache<Map<string, MiUserListMembership>>;

	/**
	 * Maps list IDs (key) to the map of user ID / MiUserListMembership instances (value) for all users in this list.
	 */
	public readonly listUserMembershipsCache: ManagedQuantumKVCache<Map<string, MiUserListMembership>>;

	/**
	 * Maps user IDs (key) to the set of list IDs (value) that are favorited by that user
	 */
	public readonly userListFavoritesCache: ManagedQuantumKVCache<Set<string>>;

	/**
	 * Maps list IDs (key) to the set of user IDs (value) who have favorited this list.
	 */
	public readonly listUserFavoritesCache: ManagedQuantumKVCache<Set<string>>;

	/**
	 * Maps user IDs (key) to the set of user IDs (value) who's renotes are muted by that user.
	 */
	public readonly renoteMutingsCache: ManagedQuantumKVCache<Set<string>>;

	/**
	 * Maps user IDs (key) to the set of thread IDs (value) muted by that user.
	 */
	public readonly threadMutingsCache: ManagedQuantumKVCache<Set<string>>;

	/**
	 * Maps user IDs (key) to the set of note IDs (value) muted by that user.
	 */
	public readonly noteMutingsCache: ManagedQuantumKVCache<Set<string>>;

	/**
	 * Maps user IDs (key) to the map of user ID / MiFollowing instances (value) followed by that user.
	 */
	public readonly userFollowingsCache: ManagedQuantumKVCache<Map<string, Omit<MiFollowing, 'isFollowerHibernated'>>>;

	/**
	 * Maps user IDs (key) to the map of user ID / MiFollowing instances (value) following that user.
	 */
	public readonly userFollowersCache: ManagedQuantumKVCache<Map<string, Omit<MiFollowing, 'isFollowerHibernated'>>>;

	/**
	 * Maps user IDs (key) to hibernation state (value).
	 */
	public readonly hibernatedUserCache: ManagedQuantumKVCache<boolean>;

	/**
	 * Maps user IDs (key) to follow statistics (value).
	 */
	public readonly userFollowStatsCache: ManagedMemoryKVCache<FollowStats>;

	/**
	 * Maps user IDs (key) to the decorations
	 */
	public readonly stpvRemoteUserDecorationsCache: ManagedQuantumKVCache<StpvRemoteUserDecorationsCacheType>;

	/**
	 * Maps user IDs (key) to the set of cahnnel IDs (value) followed by that user.
	 */
	public readonly userFollowingChannelsCache: ManagedQuantumKVCache<Set<string>>;

	constructor(
		@Inject(DI.usersRepository)
		private readonly usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private readonly userProfilesRepository: UserProfilesRepository,

		@Inject(DI.mutingsRepository)
		private readonly mutingsRepository: MutingsRepository,

		@Inject(DI.blockingsRepository)
		private readonly blockingsRepository: BlockingsRepository,

		@Inject(DI.renoteMutingsRepository)
		private readonly renoteMutingsRepository: RenoteMutingsRepository,

		@Inject(DI.followingsRepository)
		private readonly followingsRepository: FollowingsRepository,

		@Inject(DI.config)
		private readonly config: Config,

		@Inject(DI.noteThreadMutingsRepository)
		private readonly noteThreadMutingsRepository: NoteThreadMutingsRepository,

		@Inject(DI.channelFollowingsRepository)
		private readonly channelFollowingsRepository: ChannelFollowingsRepository,

		@Inject(DI.userListMembershipsRepository)
		private readonly userListMembershipsRepository: UserListMembershipsRepository,

		@Inject(DI.userListFavoritesRepository)
		private readonly userListFavoritesRepository: UserListFavoritesRepository,

		private readonly internalEventService: InternalEventService,
		private readonly httpRequestService: HttpRequestService,
		private readonly cacheManagementService: CacheManagementService,
		private readonly timeService: TimeService,
	) {
		this.userByIdCache = this.cacheManagementService.createQuantumKVCache('userById', {
			lifetime: 1000 * 60 * 5, // 5m
			fetcher: async (userId) => await this.usersRepository.findOneByOrFail({ id: userId }),
			optionalFetcher: async (userId) => await this.usersRepository.findOneBy({ id: userId }),
			bulkFetcher: async (userIds) => {
				const users = await this.usersRepository.findBy({ id: In(userIds) });
				return users.map(user => [user.id, user]);
			},
		});

		this.nativeTokenCache = this.cacheManagementService.createQuantumKVCache('localUserByNativeToken', {
			lifetime: 1000 * 60 * 5, // 5m
			fetcher: async (token) => {
				const { id } = await this.usersRepository
					.createQueryBuilder('user')
					.select('user.id')
					.where({ token })
					.getOneOrFail() as { id: string };
				return id;
			},
			optionalFetcher: async (token) => {
				const result = await this.usersRepository
					.createQueryBuilder('user')
					.select('user.id')
					.where({ token })
					.getOne() as { id: string } | null;
				return result?.id;
			},
			bulkFetcher: async (tokens) => {
				const users = await this.usersRepository
					.createQueryBuilder('user')
					.select('user.id')
					.addSelect('user.token')
					.where({ token: In(tokens) })
					.getMany() as { id: string, token: string }[];
				return users.map(user => [user.token, user.id]);
			},
		});

		this.userByAcctCache = this.cacheManagementService.createQuantumKVCache('userByAcct', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async (acct) => {
				const parsed = Acct.parse(acct);
				const { id } = await this.usersRepository
					.createQueryBuilder('user')
					.select('user.id')
					.where({
						usernameLower: parsed.username.toLowerCase(),
						host: parsed.host ?? IsNull(),
					})
					.getOneOrFail();
				return id;
			},
			optionalFetcher: async (acct) => {
				const parsed = Acct.parse(acct);
				const res = await this.usersRepository
					.createQueryBuilder('user')
					.select('user.id')
					.where({
						usernameLower: parsed.username.toLowerCase(),
						host: parsed.host ?? IsNull(),
					})
					.getOne();
				return res?.id;
			},
			// no bulkFetcher possible
		});

		this.userProfileCache = this.cacheManagementService.createQuantumKVCache('userProfile', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async userId => await this.userProfilesRepository.findOneByOrFail({ userId }),
			optionalFetcher: async userId => await this.userProfilesRepository.findOneBy({ userId }),
			bulkFetcher: async userIds => {
				const profiles = await this.userProfilesRepository.findBy({ userId: In(userIds) });
				return profiles.map(profile => [profile.userId, profile]);
			},
		});

		this.userMutingsCache = this.cacheManagementService.createQuantumKVCache<Set<string>>('userMutings', {
			lifetime: 1000 * 60 * 3, // 3m (workaround for mute expiration)
			fetcher: async muterId => {
				const mutings = await this.mutingsRepository.find({ where: { muterId: muterId }, select: ['muteeId'] });
				return new Set(mutings.map(muting => muting.muteeId));
			},
			// no optionalFetcher needed
			bulkFetcher: async muterIds => {
				const mutings = await this.mutingsRepository
					.createQueryBuilder('muting')
					.select('"muting"."muterId"', 'muterId')
					.addSelect('array_agg("muting"."muteeId")', 'muteeIds')
					.where({ muterId: In(muterIds) })
					.andWhere(new Brackets(qb => qb
						.orWhere({ expiresAt: IsNull() })
						.orWhere({ expiresAt: MoreThan(this.timeService.date) })))
					.groupBy('muting.muterId')
					.getRawMany<{ muterId: string, muteeIds: string[] }>();
				return mutings.map(muting => [muting.muterId, new Set(muting.muteeIds)]);
			},
		});

		this.userMutedCache = this.cacheManagementService.createQuantumKVCache<Set<string>>('userMuted', {
			lifetime: 1000 * 60 * 3, // 3m (workaround for mute expiration)
			fetcher: async muteeId => {
				const mutings = await this.mutingsRepository.find({ where: { muteeId }, select: ['muterId'] });
				return new Set(mutings.map(muting => muting.muterId));
			},
			// no optionalFetcher needed
			bulkFetcher: async muteeIds => {
				const mutings = await this.mutingsRepository
					.createQueryBuilder('muting')
					.select('"muting"."muteeId"', 'muteeId')
					.addSelect('array_agg("muting"."muterId")', 'muterIds')
					.where({ muteeId: In(muteeIds) })
					.andWhere(new Brackets(qb => qb
						.orWhere({ expiresAt: IsNull() })
						.orWhere({ expiresAt: MoreThan(this.timeService.date) })))
					.groupBy('muting.muteeId')
					.getRawMany<{ muteeId: string, muterIds: string[] }>();
				return mutings.map(muting => [muting.muteeId, new Set(muting.muterIds)]);
			},
		});

		this.userBlockingCache = this.cacheManagementService.createQuantumKVCache<Set<string>>('userBlocking', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async blockerId => {
				const blockings = await this.blockingsRepository.find({ where: { blockerId }, select: ['blockeeId'] });
				return new Set(blockings.map(blocking => blocking.blockeeId));
			},
			// no optionalFetcher needed
			bulkFetcher: async blockerIds => {
				const blockings = await this.blockingsRepository
					.createQueryBuilder('blocking')
					.select('"blocking"."blockerId"', 'blockerId')
					.addSelect('array_agg("blocking"."blockeeId")', 'blockeeIds')
					.where({ blockerId: In(blockerIds) })
					.groupBy('blocking.blockerId')
					.getRawMany<{ blockerId: string, blockeeIds: string[] }>();
				return blockings.map(blocking => [blocking.blockerId, new Set(blocking.blockeeIds)]);
			},
		});

		this.userBlockedCache = this.cacheManagementService.createQuantumKVCache<Set<string>>('userBlocked', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async blockeeId => {
				const blockings = await this.blockingsRepository.find({ where: { blockeeId: blockeeId }, select: ['blockerId'] });
				return new Set(blockings.map(blocking => blocking.blockerId));
			},
			// no optionalFetcher needed
			bulkFetcher: async blockeeIds => {
				const blockings = await this.blockingsRepository
					.createQueryBuilder('blocking')
					.select('"blocking"."blockeeId"', 'blockeeId')
					.addSelect('array_agg("blocking"."blockerId")', 'blockerIds')
					.where({ blockeeId: In(blockeeIds) })
					.groupBy('blocking.blockeeId')
					.getRawMany<{ blockeeId: string, blockerIds: string[] }>();
				return blockings.map(blocking => [blocking.blockeeId, new Set(blocking.blockerIds)]);
			},
		});

		this.userListMembershipsCache = this.cacheManagementService.createQuantumKVCache<Map<string, MiUserListMembership>>('userListMemberships', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async userId => {
				const memberships = await this.userListMembershipsRepository.findBy({ userId });
				return new Map(memberships.map(membership => [membership.userListId, membership]));
			},
			// no optionalFetcher needed
			bulkFetcher: async userIds => {
				const groups = new Map<string, Map<string, MiUserListMembership>>;

				const memberships = await this.userListMembershipsRepository.findBy({ userId: In(userIds) });
				for (const membership of memberships) {
					let listsForUser = groups.get(membership.userId);
					if (!listsForUser) {
						listsForUser = new Map();
						groups.set(membership.userId, listsForUser);
					}
					listsForUser.set(membership.userListId, membership);
				}

				return groups;
			},
		});

		this.listUserMembershipsCache = this.cacheManagementService.createQuantumKVCache<Map<string, MiUserListMembership>>('listUserMemberships', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async userListId => {
				const memberships = await this.userListMembershipsRepository.findBy({ userListId });
				return new Map(memberships.map(membership => [membership.userId, membership]));
			},
			// no optionalFetcher needed
			bulkFetcher: async userListIds => {
				const memberships = await this.userListMembershipsRepository.findBy({ userListId: In(userListIds) });
				const groups = new Map<string, Map<string, MiUserListMembership>>();
				for (const membership of memberships) {
					let usersForList = groups.get(membership.userListId);
					if (!usersForList) {
						usersForList = new Map();
						groups.set(membership.userListId, usersForList);
					}
					usersForList.set(membership.userId, membership);
				}
				return groups;
			},
		});

		this.userListFavoritesCache = cacheManagementService.createQuantumKVCache<Set<string>>('userListFavorites', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async userId => {
				const favorites = await this.userListFavoritesRepository.find({ where: { userId }, select: ['userListId'] });
				return new Set(favorites.map(favorites => favorites.userListId));
			},
			// no optionalFetcher needed
			bulkFetcher: async userIds => {
				const favorites = await this.userListFavoritesRepository
					.createQueryBuilder('favorite')
					.select('"favorite"."userId"', 'userId')
					.addSelect('array_agg("favorite"."userListId")', 'userListIds')
					.where({ userId: In(userIds) })
					.groupBy('favorite.userId')
					.getRawMany<{ userId: string, userListIds: string[] }>();
				return favorites.map(favorite => [favorite.userId, new Set(favorite.userListIds)]);
			},
		});

		this.listUserFavoritesCache = cacheManagementService.createQuantumKVCache<Set<string>>('listUserFavorites', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async userListId => {
				const favorites = await this.userListFavoritesRepository.find({ where: { userListId }, select: ['userId'] });
				return new Set(favorites.map(favorite => favorite.userId));
			},
			// no optionalFetcher needed
			bulkFetcher: async userListIds => {
				const favorites = await this.userListFavoritesRepository
					.createQueryBuilder('favorite')
					.select('"favorite"."userListId"', 'userListId')
					.addSelect('array_agg("favorite"."userId")', 'userIds')
					.where({ userListId: In(userListIds) })
					.groupBy('favorite.userListId')
					.getRawMany<{ userListId: string, userIds: string[] }>();
				return favorites.map(favorite => [favorite.userListId, new Set(favorite.userIds)]);
			},
		});

		this.renoteMutingsCache = this.cacheManagementService.createQuantumKVCache<Set<string>>('renoteMutings', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async muterId => {
				const mutings = await this.renoteMutingsRepository.find({ where: { muterId: muterId }, select: ['muteeId'] });
				return new Set(mutings.map(muting => muting.muteeId));
			},
			// no optionalFetcher needed
			bulkFetcher: async muterIds => {
				const mutings = await this.renoteMutingsRepository
					.createQueryBuilder('muting')
					.select('"muting"."muterId"', 'muterId')
					.addSelect('array_agg("muting"."muteeId")', 'muteeIds')
					.where({ muterId: In(muterIds) })
					.groupBy('muting.muterId')
					.getRawMany<{ muterId: string, muteeIds: string[] }>();
				return mutings.map(muting => [muting.muterId, new Set(muting.muteeIds)]);
			},
		});

		this.threadMutingsCache = this.cacheManagementService.createQuantumKVCache<Set<string>>('threadMutings', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async muterId => {
				const mutings = await this.noteThreadMutingsRepository.find({ where: { userId: muterId, isPostMute: false }, select: { threadId: true } });
				return new Set(mutings.map(muting => muting.threadId));
			},
			// no optionalFetcher needed
			bulkFetcher: async muterIds => {
				const mutings = await this.noteThreadMutingsRepository
					.createQueryBuilder('muting')
					.select('"muting"."userId"', 'userId')
					.addSelect('array_agg("muting"."threadId")', 'threadIds')
					.groupBy('"muting"."userId"')
					.where({ userId: In(muterIds), isPostMute: false })
					.getRawMany<{ userId: string, threadIds: string[] }>();
				return mutings.map(muting => [muting.userId, new Set(muting.threadIds)]);
			},
		});

		this.noteMutingsCache = this.cacheManagementService.createQuantumKVCache<Set<string>>('noteMutings', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async muterId => {
				const mutings = await this.noteThreadMutingsRepository.find({ where: { userId: muterId, isPostMute: true }, select: { threadId: true } });
				return new Set(mutings.map(mutings => mutings.threadId));
			},
			// no optionalFetcher needed
			bulkFetcher: async muterIds => {
				const mutings = await this.noteThreadMutingsRepository
					.createQueryBuilder('muting')
					.select('"muting"."userId"', 'userId')
					.addSelect('array_agg("muting"."threadId")', 'threadIds')
					.groupBy('"muting"."userId"')
					.where({ userId: In(muterIds), isPostMute: true })
					.getRawMany<{ userId: string, threadIds: string[] }>();
				return mutings.map(muting => [muting.userId, new Set(muting.threadIds)]);
			},
		});

		this.userFollowingsCache = this.cacheManagementService.createQuantumKVCache<Map<string, Omit<MiFollowing, 'isFollowerHibernated'>>>('userFollowings', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async followerId => {
				const followings = await this.followingsRepository.findBy({ followerId: followerId });
				return new Map(followings.map(following => [following.followeeId, following]));
			},
			// no optionalFetcher needed
			bulkFetcher: async followerIds => {
				const groups = new Map<string, Map<string, Omit<MiFollowing, 'isFollowerHibernated'>>>();

				const followings = await this.followingsRepository.findBy({ followerId: In(followerIds) });
				for (const following of followings) {
					let group = groups.get(following.followerId);
					if (!group) {
						group = new Map();
						groups.set(following.followerId, group);
					}
					group.set(following.followeeId, following);
				}

				return groups;
			},
		});

		this.userFollowersCache = this.cacheManagementService.createQuantumKVCache<Map<string, Omit<MiFollowing, 'isFollowerHibernated'>>>('userFollowers', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async followeeId => {
				const followings = await this.followingsRepository.findBy({ followeeId: followeeId });
				return new Map(followings.map(following => [following.followerId, following]));
			},
			// no optionalFetcher needed
			bulkFetcher: async followeeIds => {
				const groups = new Map<string, Map<string, Omit<MiFollowing, 'isFollowerHibernated'>>>();

				const followings = await this.followingsRepository.findBy({ followeeId: In(followeeIds) });
				for (const following of followings) {
					let group = groups.get(following.followeeId);
					if (!group) {
						group = new Map();
						groups.set(following.followeeId, group);
					}
					group.set(following.followerId, following);
				}

				return groups;
			},
		});

		// cache remote user's avatar decorations
		this.stpvRemoteUserDecorationsCache = this.cacheManagementService.createQuantumKVCache<StpvRemoteUserDecorationsCacheType>('stpvRemoteUserDecorationsCache', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: (key) => this.userByIdCache.fetch(key).then(user => {
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
		});

		this.hibernatedUserCache = this.cacheManagementService.createQuantumKVCache<boolean>('hibernatedUsers', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async userId => {
				const { isHibernated } = await this.usersRepository.findOneOrFail({ where: { id: userId }, select: { isHibernated: true } });
				return isHibernated;
			},
			optionalFetcher: async userId => {
				const result = await this.usersRepository.findOne({ where: { id: userId }, select: { isHibernated: true } });
				return result?.isHibernated;
			},
			bulkFetcher: async userIds => {
				const results = await this.usersRepository.find({ where: { id: In(userIds) }, select: { id: true, isHibernated: true } });
				return results.map(({ id, isHibernated }) => [id, isHibernated]);
			},
			onChanged: async userIds => {
				// We only update local copies since each process will get this event, but we can have user objects in multiple different caches.
				// Before doing anything else we must "find" all the objects to update.
				const userObjects = new Map<string, MiUser[]>();
				const toUpdate: string[] = [];
				for (const uid of userIds) {
					const toAdd: MiUser[] = [];

					const userById = this.userByIdCache.getMaybe(uid);
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
							for (const user of users) {
								user.isHibernated = isHibernated;
							}
						}
					}
				}
			},
		});

		this.userFollowStatsCache = this.cacheManagementService.createMemoryKVCache<FollowStats>('followStats', 1000 * 60 * 10); // 10 minutes

		this.userFollowingChannelsCache = this.cacheManagementService.createQuantumKVCache<Set<string>>('userFollowingChannels', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async (followerId) => {
				const followings = await this.channelFollowingsRepository.find({ where: { followerId: followerId }, select: ['followeeId'] });
				return new Set(followings.map(following => following.followeeId));
			},
			// no optionalFetcher needed
			bulkFetcher: async followerIds => {
				const followings = await this.channelFollowingsRepository
					.createQueryBuilder('following')
					.select('"following"."followerId"', 'followerId')
					.addSelect('array_agg("following"."followeeId")', 'followeeIds')
					.where({ followerId: In(followerIds) })
					.groupBy('following.followerId')
					.getRawMany<{ followerId: string, followeeIds: string[] }>();
				return followings.map(following => [following.followerId, new Set(following.followeeIds)]);
			},
		});

		this.internalEventService.on('usersUpdated', this.onUserEvent);
		this.internalEventService.on('userChangeSuspendedState', this.onUserEvent);
		this.internalEventService.on('userChangeDeletedState', this.onUserEvent);
		this.internalEventService.on('remoteUserUpdated', this.onUserEvent);
		this.internalEventService.on('localUserUpdated', this.onUserEvent);
		this.internalEventService.on('userUpdated', this.onUserEvent);
		this.internalEventService.on('userTokenRegenerated', this.onTokenEvent);
		this.internalEventService.on('follow', this.onFollowEvent);
		this.internalEventService.on('unfollow', this.onFollowEvent);
		// For these, only listen to local events because quantum cache handles the sync.
		this.internalEventService.on('followChannel', this.onChannelEvent, { ignoreRemote: true });
		this.internalEventService.on('unfollowChannel', this.onChannelEvent, { ignoreRemote: true });
		this.internalEventService.on('updateUserProfile', this.onProfileEvent, { ignoreRemote: true });
		this.internalEventService.on('userListMemberAdded', this.onListMemberEvent, { ignoreRemote: true });
		this.internalEventService.on('userListMemberUpdated', this.onListMemberEvent, { ignoreRemote: true });
		this.internalEventService.on('userListMemberRemoved', this.onListMemberEvent, { ignoreRemote: true });
		this.internalEventService.on('userListMemberBulkAdded', this.onListMemberEvent, { ignoreRemote: true });
		this.internalEventService.on('userListMemberBulkUpdated', this.onListMemberEvent, { ignoreRemote: true });
		this.internalEventService.on('userListMemberBulkRemoved', this.onListMemberEvent, { ignoreRemote: true });
	}

	@bindThis
	private async onUserEvent<E extends 'userChangeSuspendedState' | 'userChangeDeletedState' | 'remoteUserUpdated' | 'localUserUpdated' | 'usersUpdated' | 'userUpdated'>(body: InternalEventTypes[E], _: E, isLocal: boolean): Promise<void> {
		// Local instance is responsible for expanding these events into the appropriate Quantum events
		if (!isLocal) return;

		const ids = 'ids' in body ? body.ids : [body.id];
		if (ids.length === 0) return;

		// Contains IDs of all lists where this user is a member.
		const userListMemberships = this.listUserMembershipsCache
			.entries()
			.filter(e => ids.some(id => e[1].has(id)))
			.map(e => e[0])
			.toArray();

		await Promise.all([
			this.userByIdCache.deleteMany(ids),
			this.userProfileCache.deleteMany(ids),
			this.userMutingsCache.deleteMany(ids),
			this.userMutedCache.deleteMany(ids),
			this.userBlockingCache.deleteMany(ids),
			this.userBlockedCache.deleteMany(ids),
			this.renoteMutingsCache.deleteMany(ids),
			this.userFollowingsCache.deleteMany(ids),
			this.userFollowersCache.deleteMany(ids),
			this.hibernatedUserCache.deleteMany(ids),
			this.threadMutingsCache.deleteMany(ids),
			this.noteMutingsCache.deleteMany(ids),
			this.userListMembershipsCache.deleteMany(ids),
			this.listUserMembershipsCache.deleteMany(userListMemberships),
		]);
	}

	@bindThis
	private async onTokenEvent<E extends 'userTokenRegenerated'>(body: InternalEventTypes[E], _: E, isLocal: boolean): Promise<void> {
		// Local instance is responsible for expanding these events into the appropriate Quantum events
		if (!isLocal) return;

		await Promise.all([
			this.nativeTokenCache.delete(body.oldToken),
			this.nativeTokenCache.set(body.newToken, body.id),
		]);
	}

	@bindThis
	private async onFollowEvent<E extends 'follow' | 'unfollow'>(body: InternalEventTypes[E], type: E): Promise<void> {
		{
			// TODO should we filter for local/remote events?
			switch (type) {
				case 'follow': {
					const follower = this.userByIdCache.getMaybe(body.followerId);
					if (follower) follower.followingCount++;
					const followee = this.userByIdCache.getMaybe(body.followeeId);
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
					const follower = this.userByIdCache.getMaybe(body.followerId);
					if (follower) follower.followingCount--;
					const followee = this.userByIdCache.getMaybe(body.followeeId);
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
	private async onChannelEvent<E extends 'followChannel' | 'unfollowChannel'>(body: InternalEventTypes[E]): Promise<void> {
		await this.userFollowingChannelsCache.delete(body.userId);
	}

	@bindThis
	private async onProfileEvent<E extends 'updateUserProfile'>(body: InternalEventTypes[E]): Promise<void> {
		await this.userProfileCache.delete(body.userId);
	}

	@bindThis
	private async onListMemberEvent<E extends 'userListMemberAdded' | 'userListMemberUpdated' | 'userListMemberRemoved' | 'userListMemberBulkAdded' | 'userListMemberBulkUpdated' | 'userListMemberBulkRemoved'>(body: InternalEventTypes[E]): Promise<void> {
		const userListIds = 'userListIds' in body ? body.userListIds : [body.userListId];
		await Promise.all([
			this.userListMembershipsCache.delete(body.memberId),
			this.listUserMembershipsCache.deleteMany(userListIds),
		]);
	}

	@bindThis
	public async findUserById(userId: MiUser['id']): Promise<MiUser> {
		return await this.userByIdCache.fetch(userId);
	}

	@bindThis
	public async findUsersById(userIds: Iterable<string>): Promise<Map<string, MiUser>> {
		return new Map(await this.userByIdCache.fetchMany(userIds));
	}

	@bindThis
	public async findOptionalUserById(userId: MiUser['id']): Promise<MiUser | undefined> {
		return await this.userByIdCache.fetchMaybe(userId);
	}

	@bindThis
	public async findUserByAcct(acct: string | Acct.Acct): Promise<MiUser> {
		acct = typeof(acct) === 'string' ? acct : Acct.toString(acct);
		const id = await this.userByAcctCache.fetch(acct);
		return await this.findUserById(id);
	}

	@bindThis
	public async findOptionalUserByAcct(acct: string | Acct.Acct): Promise<MiUser | undefined> {
		acct = typeof(acct) === 'string' ? acct : Acct.toString(acct);

		const id = await this.userByAcctCache.fetchMaybe(acct);
		if (id == null) return undefined;

		return await this.findOptionalUserById(id);
	}

	@bindThis
	public async findLocalUserById(userId: MiUser['id']): Promise<MiLocalUser> {
		const user = await this.findUserById(userId);

		if (!isLocalUser(user)) {
			throw new IdentifiableError('aeac1339-2550-4521-a8e3-781f06d98656', 'User is not local');
		}

		return user;
	}

	@bindThis
	public async findOptionalLocalUserById(userId: MiUser['id']): Promise<MiLocalUser | undefined> {
		const user = await this.findOptionalUserById(userId);

		if (user && !isLocalUser(user)) {
			throw new IdentifiableError('aeac1339-2550-4521-a8e3-781f06d98656', 'User is not local');
		}

		return user;
	}

	@bindThis
	public async findLocalUserByNativeToken(token: string): Promise<MiLocalUser> {
		const id = await this.nativeTokenCache.fetch(token);
		return await this.findLocalUserById(id);
	}

	@bindThis
	public async findOptionalLocalUserByNativeToken(token: string): Promise<MiLocalUser | undefined> {
		const id = await this.nativeTokenCache.fetchMaybe(token);
		if (id == null) return undefined;

		return await this.findOptionalLocalUserById(id);
	}

	@bindThis
	public async findRemoteUserById(userId: MiUser['id']): Promise<MiRemoteUser> {
		const user = await this.findUserById(userId);

		if (!isRemoteUser(user)) {
			throw new IdentifiableError('aeac1339-2550-4521-a8e3-781f06d98656', 'User is not remote');
		}

		return user;
	}

	@bindThis
	public async findOptionalRemoteUserById(userId: MiUser['id']): Promise<MiRemoteUser | undefined> {
		const user = await this.findOptionalUserById(userId);

		if (user && !isRemoteUser(user)) {
			throw new IdentifiableError('aeac1339-2550-4521-a8e3-781f06d98656', 'User is not remote');
		}

		return user;
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
	public async isFollowing(follower: string | { id: string }, followee: string | { id: string }): Promise<boolean> {
		const followerId = typeof(follower) === 'string' ? follower : follower.id;
		const followeeId = typeof(followee) === 'string' ? followee : followee.id;

		// This lets us use whichever one is in memory, falling back to DB fetch via userFollowingsCache.
		return this.userFollowersCache.getMaybe(followeeId)?.has(followerId)
		?? (await this.userFollowingsCache.fetch(followerId)).has(followeeId);
	}

	/**
	 * Returns all hibernated followers.
	 */
	@bindThis
	public async getHibernatedFollowers(followeeId: string): Promise<MiFollowing[]> {
		const followers = await this.getFollowersWithHibernation(followeeId);
		return followers.filter(follower => follower.isFollowerHibernated);
	}

	/**
	 * Returns all non-hibernated followers.
	 */
	@bindThis
	public async getNonHibernatedFollowers(followeeId: string): Promise<MiFollowing[]> {
		const followers = await this.getFollowersWithHibernation(followeeId);
		return followers.filter(follower => !follower.isFollowerHibernated);
	}

	/**
	 * Returns follower relations with populated isFollowerHibernated.
	 * If you don't need this field, then please use userFollowersCache directly for reduced overhead.
	 */
	@bindThis
	public async getFollowersWithHibernation(followeeId: string): Promise<MiFollowing[]> {
		const followers = await this.userFollowersCache.fetch(followeeId);
		const hibernations = new Map(await this.hibernatedUserCache.fetchMany(followers.keys()));
		return followers
			.values()
			.map(following => ({
				...following,
				isFollowerHibernated: hibernations.get(following.followerId) ?? false,
			}))
			.toArray();
	}

	/**
	 * Refreshes follower and following relations for the given user.
	 */
	@bindThis
	public async refreshFollowRelationsFor(userId: string): Promise<void> {
		const followings = await this.userFollowingsCache.refresh(userId);
		const followees = followings.values().map(following => following.followeeId);
		await this.userFollowersCache.deleteMany(followees);
	}

	@bindThis
	public clear(): void {
		this.cacheManagementService.clear();
	}

	@bindThis
	public dispose(): void {
		this.internalEventService.off('usersUpdated', this.onUserEvent);
		this.internalEventService.off('userChangeSuspendedState', this.onUserEvent);
		this.internalEventService.off('userChangeDeletedState', this.onUserEvent);
		this.internalEventService.off('remoteUserUpdated', this.onUserEvent);
		this.internalEventService.off('localUserUpdated', this.onUserEvent);
		this.internalEventService.off('userUpdated', this.onUserEvent);
		this.internalEventService.off('userTokenRegenerated', this.onTokenEvent);
		this.internalEventService.off('follow', this.onFollowEvent);
		this.internalEventService.off('unfollow', this.onFollowEvent);
		this.internalEventService.off('followChannel', this.onChannelEvent);
		this.internalEventService.off('unfollowChannel', this.onChannelEvent);
		this.internalEventService.off('updateUserProfile', this.onProfileEvent);
		this.internalEventService.off('userListMemberAdded', this.onListMemberEvent);
		this.internalEventService.off('userListMemberUpdated', this.onListMemberEvent);
		this.internalEventService.off('userListMemberRemoved', this.onListMemberEvent);
		this.internalEventService.off('userListMemberBulkAdded', this.onListMemberEvent);
		this.internalEventService.off('userListMemberBulkUpdated', this.onListMemberEvent);
		this.internalEventService.off('userListMemberBulkRemoved', this.onListMemberEvent);
	}

	@bindThis
	public onApplicationShutdown(): void {
		this.dispose();
	}
}
