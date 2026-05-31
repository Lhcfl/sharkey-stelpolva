/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors; originally based on code by syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { In, IsNull, Not } from 'typeorm';
import type {
	BlockingsRepository,
	FollowingsRepository,
	MutingsRepository,
	RenoteMutingsRepository,
	MiUserProfile,
	UserProfilesRepository,
	UsersRepository,
	NoteThreadMutingsRepository,
	ChannelFollowingsRepository,
	UserListMembershipsRepository,
	UserListFavoritesRepository,
	FollowRequestsRepository,
	UserMemosRepository,
} from '@/models/_.js';
import type { MiLocalUser, MiRemoteUser, MiUser } from '@/models/User.js';
import type { MiUserListMembership } from '@/models/UserListMembership.js';
import { DI } from '@/di-symbols.js';
import { isLocalUser, isRemoteUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';
import { toArray } from '@/misc/prelude/array.js';
import { IsOne } from '@/misc/is-one.js';
import { InternalEventService, type InternalEventContext, type InternalEventTypes } from '@/global/InternalEventService.js';
import { UtilityService } from '@/core/UtilityService.js';
import * as Acct from '@/misc/acct.js';
import { IdentifiableError, errorCodes } from '@/misc/identifiable-error.js';
import {
	CacheManagementService,
	type ManagedMemoryKVCache,
	type ManagedQuantumKVCache,
} from '@/global/CacheManagementService.js';
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

/** Sentinel value for "follow requested". Value is 0 (falsy) so that "isFollowing" only evalautes to "true" when the follow is accepted. */
export const Requested = 0;

export interface UserRelation {
	/** ID of the user who owns these relations */
	userId: string;
	/** ID of the user who is the subject of these relations */
	targetUserId: string;

	isFollowing: boolean | typeof Requested;
	isFollowed: boolean | typeof Requested;

	isFollowingWithReplies: boolean;
	isFollowedWithReplies: boolean;

	isFollowingWithNotifications: boolean;
	isFollowedWithNotifications: boolean;

	isMuting: boolean;
	isMuted: boolean;

	isMutingRenotes: boolean;
	isMutedRenotes: boolean;

	isMutingInstance: boolean;
	isMutedInstance: boolean;

	isBlocking: boolean;
	isBlocked: boolean;

	memo: string | null;
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
	 * Maps actor URIs (key) to user IDs (value).
	 */
	public readonly uriPersonCache: ManagedQuantumKVCache<string>;

	/**
	 * Maps user IDs (key) to MiUserProfile instances (value).
	 * This is the ONLY source for cached MiUserProfile entities!
	 */
	public readonly userProfileCache: ManagedQuantumKVCache<MiUserProfile>;

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
	 * Maps user IDs (key) to the set of thread IDs (value) muted by that user.
	 */
	public readonly threadMutingsCache: ManagedQuantumKVCache<Set<string>>;

	/**
	 * Maps user IDs (key) to the set of note IDs (value) muted by that user.
	 */
	public readonly noteMutingsCache: ManagedQuantumKVCache<Set<string>>;

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

	/**
	 * Maps user ID:ID pairs (key) to an object describing the relationship(s) between those users.
	 */
	public readonly userRelationsCache: ManagedQuantumKVCache<UserRelation>;

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
		@Inject(DI.followRequestsRepository)
		private readonly followRequestsRepository: FollowRequestsRepository,

		@Inject(DI.noteThreadMutingsRepository)
		private readonly noteThreadMutingsRepository: NoteThreadMutingsRepository,

		@Inject(DI.channelFollowingsRepository)
		private readonly channelFollowingsRepository: ChannelFollowingsRepository,

		@Inject(DI.userListMembershipsRepository)
		private readonly userListMembershipsRepository: UserListMembershipsRepository,

		@Inject(DI.userListFavoritesRepository)
		private readonly userListFavoritesRepository: UserListFavoritesRepository,

		@Inject(DI.userMemosRepository)
		private readonly userMemosRepository: UserMemosRepository,

		private readonly internalEventService: InternalEventService,
		private readonly httpRequestService: HttpRequestService,
		private readonly cacheManagementService: CacheManagementService,
		private readonly utilityService: UtilityService,
	) {
		this.userByIdCache = this.cacheManagementService.createQuantumKVCache('userById', {
			lifetime: 1000 * 60 * 5, // 5m
			fetcher: async (userId) => await this.usersRepository.findOneByOrFail({ id: userId }),
			optionalFetcher: async (userId) => await this.usersRepository.findOneBy({ id: userId }),
			bulkFetcher: async (userIds) => {
				const users = await this.usersRepository.findBy({ id: IsOne(userIds) });
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
					.where({ token: IsOne(tokens) })
					.getMany() as { id: string, token: string }[];
				return users.map(user => [user.token, user.id]);
			},
		});

		this.userByAcctCache = this.cacheManagementService.createQuantumKVCache('userByAcct', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async (acct) => {
				const parsed = this.utilityService.parseAcct(acct);
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
				const parsed = this.utilityService.parseAcct(acct);
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

		this.uriPersonCache = this.cacheManagementService.createQuantumKVCache('uriPerson', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async (uri) => {
				const { id } = await this.usersRepository.findOneOrFail({
					where: { uri },
					select: { id: true },
				});
				return id;
			},
			optionalFetcher: async (uri) => {
				const res = await this.usersRepository.findOne({
					where: { uri },
					select: { id: true },
				});
				return res?.id;
			},
			bulkFetcher: async (uris) => {
				const users = await this.usersRepository.find({
					where: { uri: In(uris) },
					select: { id: true, uri: true },
				}) as { id: string, uri: string }[];
				return users.map(user => [user.uri, user.id]);
			},
		});

		this.userProfileCache = this.cacheManagementService.createQuantumKVCache('userProfile', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async userId => await this.userProfilesRepository.findOneByOrFail({ userId }),
			optionalFetcher: async userId => await this.userProfilesRepository.findOneBy({ userId }),
			bulkFetcher: async userIds => {
				const profiles = await this.userProfilesRepository.findBy({ userId: IsOne(userIds) });
				return profiles.map(profile => [profile.userId, profile]);
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

				const memberships = await this.userListMembershipsRepository.findBy({ userId: IsOne(userIds) });
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
				const memberships = await this.userListMembershipsRepository.findBy({ userListId: IsOne(userListIds) });
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
					.where({ userId: IsOne(userIds) })
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
					.where({ userListId: IsOne(userListIds) })
					.groupBy('favorite.userListId')
					.getRawMany<{ userListId: string, userIds: string[] }>();
				return favorites.map(favorite => [favorite.userListId, new Set(favorite.userIds)]);
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
					.where({ userId: IsOne(muterIds), isPostMute: false })
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
					.where({ userId: IsOne(muterIds), isPostMute: true })
					.getRawMany<{ userId: string, threadIds: string[] }>();
				return mutings.map(muting => [muting.userId, new Set(muting.threadIds)]);
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
					.where({ followerId: IsOne(followerIds) })
					.groupBy('following.followerId')
					.getRawMany<{ followerId: string, followeeIds: string[] }>();
				return followings.map(following => [following.followerId, new Set(following.followeeIds)]);
			},
		});

		this.userRelationsCache = cacheManagementService.createQuantumKVCache('userRelations', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async (pair, { fail }) => {
				const [userId, targetUserId] = pair.split(':');
				if (!userId || !targetUserId) fail(`Invalid user ID pair "${pair}"`);

				// Skip no-op fetches
				if (userId === targetUserId) {
					return {
						userId,
						targetUserId,
						isFollowing: false,
						isFollowed: false,
						isFollowingWithReplies: false,
						isFollowedWithReplies: false,
						isFollowingWithNotifications: false,
						isFollowedWithNotifications: false,
						isMuting: false,
						isMuted: false,
						isMutingRenotes: false,
						isMutedRenotes: false,
						isMutingInstance: false,
						isMutedInstance: false,
						isBlocking: false,
						isBlocked: false,
						memo: null,
					};
				}

				const [followingRelation, followedRelation, isFollowRequesting, isFollowRequested, isBlocking, isBlocked, isMuting, isMuted, isMutingRenotes, isMutedRenotes, memoRelation, userProfile, targetUserProfile] = await Promise.all([
					// followingRelation
					this.followingsRepository.findOne({ where: { followerId: userId, followeeId: targetUserId }, select: { withReplies: true } }),
					// followedRelation
					this.followingsRepository.findOne({ where: { followerId: targetUserId, followeeId: userId }, select: { withReplies: true } }),
					// isFollowRequesting
					this.followRequestsRepository.existsBy({ followerId: userId, followeeId: targetUserId }),
					// isFollowRequested
					this.followRequestsRepository.existsBy({ followerId: targetUserId, followeeId: userId }),

					// isBlocking
					this.blockingsRepository.existsBy({ blockerId: userId, blockeeId: targetUserId }),
					// isBlocked
					this.blockingsRepository.existsBy({ blockerId: targetUserId, blockeeId: userId }),

					// isMuting
					this.mutingsRepository.existsBy({ muterId: userId, muteeId: targetUserId }),
					// isMuted
					this.mutingsRepository.existsBy({ muterId: targetUserId, muteeId: userId }),

					// isMutingRenotes
					this.renoteMutingsRepository.existsBy({ muterId: userId, muteeId: targetUserId }),
					// isMutedRenotes
					this.renoteMutingsRepository.existsBy({ muterId: targetUserId, muteeId: userId }),

					// memo
					this.userMemosRepository.findOne({ where: { userId, targetUserId }, select: { memo: true } }),

					// userProfile
					this.userProfileCache.fetchMaybe(userId),
					// targetUserProfile
					this.userProfileCache.fetchMaybe(targetUserId),
				]);

				// Unpack relations
				const isFollowing = followingRelation != null || (isFollowRequesting ? Requested : false);
				const isFollowingWithReplies = followingRelation?.withReplies ?? false;
				const isFollowingWithNotifications = followingRelation?.notify === 'normal';
				const isFollowed = followedRelation != null || (isFollowRequested ? Requested : false);
				const isFollowedWithReplies = followedRelation?.withReplies ?? false;
				const isFollowedWithNotifications = followedRelation?.notify === 'normal';
				const isMutingInstance = userProfile != null && targetUserProfile?.userHost != null && userProfile.mutedInstances.includes(targetUserProfile.userHost);
				const isMutedInstance = userProfile?.userHost != null && targetUserProfile != null && targetUserProfile.mutedInstances.includes(userProfile.userHost);
				const memo = memoRelation?.memo ?? null;

				return { userId, targetUserId, isFollowing, isFollowed, isFollowingWithReplies, isFollowedWithReplies, isFollowingWithNotifications, isFollowedWithNotifications, isMuting, isMuted, isMutingRenotes, isMutedRenotes, isMutingInstance, isMutedInstance, isBlocking, isBlocked, memo };
			},
			// optionalFetcher not needed
			bulkFetcher: async (pairs, { fail }) => {
				const userIdSet = new Set<string>();
				const parsedPairs = pairs.map(pair => {
					const [userId, targetUserId] = pair.split(':');
					if (!userId || !targetUserId) {
						fail(`Invalid user ID pair "${pair}"`);
					}

					userIdSet.add(userId);
					userIdSet.add(targetUserId);
					return { pair, userId, targetUserId };
				});

				// This must be an array, or TypeORM will fail silently!
				const userIds = userIdSet.values().toArray();

				// Bulk-fetch all required data up-front
				const [followings, followRequests, blockings, mutings, renoteMutings, userMemos, userProfiles] = await Promise.all([
					// followings
					this.followingsRepository.find({
						where: { followerId: IsOne(userIds), followeeId: IsOne(userIds) },
						select: { followerId: true, followeeId: true, withReplies: true },
					}),

					// followRequests
					this.followRequestsRepository.find({
						where: { followerId: IsOne(userIds), followeeId: IsOne(userIds) },
						select: { followerId: true, followeeId: true },
					}),

					// blockings
					this.blockingsRepository.find({
						where: { blockerId: IsOne(userIds), blockeeId: IsOne(userIds) },
						select: { blockerId: true, blockeeId: true },
					}),

					// mutings
					this.mutingsRepository.find({
						where: { muterId: IsOne(userIds), muteeId: IsOne(userIds) },
						select: { muterId: true, muteeId: true },
					}),

					// renoteMutings
					this.renoteMutingsRepository.find({
						where: { muterId: IsOne(userIds), muteeId: IsOne(userIds) },
						select: { muterId: true, muteeId: true },
					}),

					// userMemos
					this.userMemosRepository.find({
						where: { userId: IsOne(userIds), targetUserId: IsOne(userIds) },
						select: { userId: true, targetUserId: true, memo: true },
					}),

					// userProfiles
					this.userProfileCache.fetchMany(userIds)
						.then(ps => new Map(ps)),
				]);

				return parsedPairs.map(({ pair, userId, targetUserId }) => {
					// Extract relevant data from bulk-fetched objects
					const followingRelation = followings.find(f => f.followerId === userId && f.followeeId === targetUserId);
					const followedRelation = followings.find(f => f.followerId === targetUserId && f.followeeId === userId);
					const isFollowRequesting = followRequests.some(r => r.followerId === userId && r.followeeId === targetUserId);
					const isFollowRequested = followRequests.some(r => r.followerId === targetUserId && r.followeeId === userId);
					const isMuting = mutings.some(m => m.muterId === userId && m.muteeId === targetUserId);
					const isMuted = mutings.some(m => m.muterId === targetUserId && m.muteeId === userId);
					const isMutingRenotes = renoteMutings.some(m => m.muterId === userId && m.muteeId === targetUserId);
					const isMutedRenotes = renoteMutings.some(m => m.muterId === targetUserId && m.muteeId === userId);
					const isBlocking = blockings.some(b => b.blockerId === userId && b.blockeeId === targetUserId);
					const isBlocked = blockings.some(b => b.blockerId === targetUserId && b.blockeeId === userId);
					const memoRelation = userMemos.find(m => m.userId === userId && m.targetUserId === targetUserId);
					const userProfile = userProfiles.get(userId);
					const targetUserProfile = userProfiles.get(targetUserId);

					// Unpack relations
					const isFollowing = followingRelation != null || (isFollowRequesting ? Requested : false);
					const isFollowingWithReplies = followingRelation?.withReplies ?? false;
					const isFollowingWithNotifications = followingRelation?.notify === 'normal';
					const isFollowed = followedRelation != null || (isFollowRequested ? Requested : false);
					const isFollowedWithReplies = followedRelation?.withReplies ?? false;
					const isFollowedWithNotifications = followedRelation?.notify === 'normal';
					const isMutingInstance = userProfile != null && targetUserProfile?.userHost != null && userProfile.mutedInstances.includes(targetUserProfile.userHost);
					const isMutedInstance = userProfile?.userHost != null && targetUserProfile != null && targetUserProfile.mutedInstances.includes(userProfile.userHost);
					const memo = memoRelation?.memo ?? null;

					const relation: UserRelation = { userId, targetUserId, isFollowing, isFollowed, isFollowingWithReplies, isFollowedWithReplies, isFollowingWithNotifications, isFollowedWithNotifications, isMuting, isMuted, isMutingRenotes, isMutedRenotes, isMutingInstance, isMutedInstance, isBlocking, isBlocked, memo };
					return [pair, relation];
				});
			},
		});

		// Update memory caches from local *and remote* events since the cache doesn't sync automatically.
		this.internalEventService.on('follow', this.onFollowEvent);
		this.internalEventService.on('unfollow', this.onFollowEvent);
		this.internalEventService.on('followChanged', this.onFollowChangedEvent);
		this.internalEventService.on('followRequested', this.onFollowRequestEvent);
		this.internalEventService.on('followRequestCancelled', this.onFollowRequestEvent);
		this.internalEventService.on('blockingCreated', this.onBlockingEvent);
		this.internalEventService.on('blockingDeleted', this.onBlockingEvent);
		this.internalEventService.on('userChangeHibernatedState', this.onHibernationEvent);
		this.internalEventService.on('mute', this.onMuteEvent);
		this.internalEventService.on('unmute', this.onMuteEvent);
		this.internalEventService.on('muteRenotes', this.onMuteEvent);
		this.internalEventService.on('unmuteRenotes', this.onMuteEvent);
		this.internalEventService.on('userMemoChanged', this.onMemoEvent);
		this.internalEventService.on('updateUserProfile', this.onProfileEvent);

		// Update quantum caches from local events only, because the cache will automatically produce new sync events.
		this.internalEventService.on('usersUpdated', this.onUserChangeEvent, { ignoreRemote: true });
		this.internalEventService.on('userChangeSuspendedState', this.onUserChangeEvent, { ignoreRemote: true });
		this.internalEventService.on('remoteUserUpdated', this.onUserChangeEvent, { ignoreRemote: true });
		this.internalEventService.on('localUserUpdated', this.onUserChangeEvent, { ignoreRemote: true });
		this.internalEventService.on('userUpdated', this.onUserChangeEvent, { ignoreRemote: true });
		this.internalEventService.on('userTokenRegenerated', this.onTokenEvent, { ignoreRemote: true });
		this.internalEventService.on('userChangeDeletedState', this.onUserDeleteEvent, { ignoreRemote: true });
		this.internalEventService.on('followChannel', this.onChannelEvent, { ignoreRemote: true });
		this.internalEventService.on('unfollowChannel', this.onChannelEvent, { ignoreRemote: true });
		this.internalEventService.on('userListMemberAdded', this.onListMemberEvent, { ignoreRemote: true });
		this.internalEventService.on('userListMemberUpdated', this.onListMemberEvent, { ignoreRemote: true });
		this.internalEventService.on('userListMemberRemoved', this.onListMemberEvent, { ignoreRemote: true });
		this.internalEventService.on('userListMemberBulkAdded', this.onListMemberEvent, { ignoreRemote: true });
		this.internalEventService.on('userListMemberBulkUpdated', this.onListMemberEvent, { ignoreRemote: true });
		this.internalEventService.on('userListMemberBulkRemoved', this.onListMemberEvent, { ignoreRemote: true });
	}

	@bindThis
	private async onUserChangeEvent<E extends 'userChangeSuspendedState' | 'remoteUserUpdated' | 'localUserUpdated' | 'usersUpdated' | 'userUpdated'>(body: InternalEventTypes[E]): Promise<void> {
		const ids = 'ids' in body ? body.ids : [body.id];
		await this.userByIdCache.deleteMany(ids);
	}

	@bindThis
	private async onUserDeleteEvent<E extends 'userChangeDeletedState'>(body: InternalEventTypes[E]): Promise<void> {
		if (!body.isDeleted) {
			return;
		}

		// Empty all caches that:
		//  A: contain user-owned data (userByIdCache, userProfileCache)
		//  B: belong to something that is not deleted (listUserMembershipsCache, listUserFavoritesCache)
		//  C: can be referenced by an alternate key (nativeTokenCache, userByAcctCache, uriPersonCache)
		//  D: are used in an iterative / non-fetch fashion (userRelationsCache)
		await Promise.all([
			this.userByIdCache.delete(body.id),
			body.token ? this.nativeTokenCache.delete(body.token) : null,
			body.uri ? this.uriPersonCache.delete(body.uri) : null,
			this.userByAcctCache.delete(Acct.toString({ username: body.usernameLower, host: body.host })),
			this.userProfileCache.delete(body.id),
			this.userListMembershipsCache.fetch(body.id)
				.then(userListMemberships => this.listUserMembershipsCache.deleteMany(userListMemberships.keys())),
			this.userListFavoritesCache.fetch(body.id)
				.then(userListFavorites => this.listUserFavoritesCache.deleteMany(userListFavorites.keys())),
			this.userRelationsCache.delete(body.id),
		]);
	}

	@bindThis
	private async onTokenEvent<E extends 'userTokenRegenerated'>(body: InternalEventTypes[E]): Promise<void> {
		await Promise.all([
			body.oldToken ? this.nativeTokenCache.delete(body.oldToken) : null,
			this.nativeTokenCache.set(body.newToken, body.id),
		]);
	}

	@bindThis
	private onFollowEvent<E extends 'follow' | 'unfollow'>(body: InternalEventTypes[E], type: E): void {
		const isFollowing = type === 'follow';
		const adjustment = isFollowing ? 1 : -1;

		// Update follower's following count
		const follower = this.userByIdCache.getMaybe(body.followerId);
		if (follower) follower.followingCount += adjustment;

		// Reset follower's follow statistics
		this.userFollowStatsCache.delete(body.followerId);

		for (const followeeId of this.extractFollowees(body.followerId, body.followeeId)) {
			// Update followee's follower count
			const followee = this.userByIdCache.getMaybe(followeeId);
			if (followee) followee.followersCount += adjustment;

			// Update follower's following status
			const forwardRelation = this.userRelationsCache.getMaybe(`${body.followerId}:${followeeId}`);
			if (forwardRelation) {
				forwardRelation.isFollowing = isFollowing;
				if (body.withReplies !== undefined) forwardRelation.isFollowingWithReplies = body.withReplies;
				if (body.notify !== undefined) forwardRelation.isFollowingWithNotifications = body.notify === 'normal';
			}

			// Update followee's followed status
			const backRelation = this.userRelationsCache.getMaybe(`${followeeId}:${body.followerId}`);
			if (backRelation) {
				backRelation.isFollowed = isFollowing;
				if (body.withReplies !== undefined) backRelation.isFollowedWithReplies = body.withReplies;
				if (body.notify !== undefined) backRelation.isFollowedWithNotifications = body.notify === 'normal';
			}

			// Reset follow statistics to recalculate later
			this.userFollowStatsCache.delete(followeeId);
		}
	}

	@bindThis
	private onFollowChangedEvent<E extends 'followChanged'>(body: InternalEventTypes[E]): void {
		for (const followeeId of this.extractFollowees(body.followerId, body.followeeId)) {
			// Update follower's metadata
			const forwardRelation = this.userRelationsCache.getMaybe(`${body.followerId}:${followeeId}`);
			if (forwardRelation) {
				if (body.withReplies !== undefined) forwardRelation.isFollowingWithReplies = body.withReplies;
				if (body.notify !== undefined) forwardRelation.isFollowingWithNotifications = body.notify === 'normal';
			}

			// Update followee's followed status
			const backRelation = this.userRelationsCache.getMaybe(`${followeeId}:${body.followerId}`);
			if (backRelation) {
				if (body.withReplies !== undefined) backRelation.isFollowedWithReplies = body.withReplies;
				if (body.notify !== undefined) backRelation.isFollowedWithNotifications = body.notify === 'normal';
			}
		}
	}

	@bindThis
	private *extractFollowees(followerId: string, followeeId: string | string[] | null): Generator<string> {
		// If followeeId is null, then it means ALL followees for the given follower.
		if (followeeId == null) {
			for (const r of this.userRelationsCache.values()) {
				if (r.userId === followerId && r.isFollowed) {
					yield r.targetUserId; // back ref
				} else if (r.targetUserId === followerId && r.isFollowing) {
					yield r.userId; // forward ref
				}
			}
		} else if (Array.isArray(followeeId)) {
			yield* followeeId;
		} else {
			yield followeeId;
		}
	}

	@bindThis
	private onFollowRequestEvent<E extends 'followRequested' | 'followRequestCancelled'>(body: InternalEventTypes[E], type: E): void {
		const followingType = type === 'followRequested' ? Requested : false;

		for (const followeeId of toArray(body.followeeId)) {
			// Update follower's requesting status
			const forwardRelation = this.userRelationsCache.getMaybe(`${body.followerId}:${followeeId}`);
			if (forwardRelation) forwardRelation.isFollowing = followingType;

			// Update followee's requested status
			const backRelation = this.userRelationsCache.getMaybe(`${followeeId}:${body.followerId}`);
			if (backRelation) backRelation.isFollowed = followingType;
		}
	}

	@bindThis
	private async onChannelEvent<E extends 'followChannel' | 'unfollowChannel'>(body: InternalEventTypes[E]): Promise<void> {
		await this.userFollowingChannelsCache.delete(body.userId);
	}

	@bindThis
	private async onProfileEvent<E extends 'updateUserProfile'>(body: InternalEventTypes[E], _type: E, ctx: Partial<InternalEventContext>): Promise<void> {
		// Update the relation cache for all events, but only if mutedInstances have changed.
		if (body.keys == null || body.keys.includes('mutedInstances')) {
			const relationKeysToClear: string[] = [];
			for (const [key, relation] of this.userRelationsCache.entries()) {
				if (relation.userId === body.userId || relation.targetUserId === body.userId) {
					relationKeysToClear.push(key);
				}
			}

			this.userRelationsCache.dropMany(relationKeysToClear);
		}

		// Update the profile cache for local events only
		// (isLocal may be undefined for local events, but will *always* be true for remote ones)
		if (ctx.isLocal !== true) {
			await this.userProfileCache.delete(body.userId);
		}
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
	private onBlockingEvent<E extends 'blockingCreated' | 'blockingDeleted'>(body: InternalEventTypes[E], type: E): void {
		// Update blocker's blocking status
		const forwardRelation = this.userRelationsCache.getMaybe(`${body.blockerId}:${body.blockeeId}`);
		if (forwardRelation) forwardRelation.isBlocking = type === 'blockingCreated';

		// Update blockee's blocked status
		const backRelation = this.userRelationsCache.getMaybe(`${body.blockeeId}:${body.blockerId}`);
		if (backRelation) backRelation.isBlocked = type === 'blockingCreated';
	}

	@bindThis
	private onHibernationEvent<E extends 'userChangeHibernatedState'>(body: InternalEventTypes[E]): void {
		// Update all cached entities
		for (const id of toArray(body.id)) {
			const cachedUser = this.userByIdCache.getMaybe(id);
			if (cachedUser) {
				cachedUser.isHibernated = body.isHibernated;
			}
		}
	}

	@bindThis
	private async onMuteEvent<E extends 'mute' | 'unmute' | 'muteRenotes' | 'unmuteRenotes'>(body: InternalEventTypes[E], type: E): Promise<void> {
		const newMuting =
			type === 'mute' ? true :
			type === 'unmute' ? false :
			null;
		const newMutingRenotes =
			type === 'muteRenotes' ? true :
			type === 'unmuteRenotes' ? false :
			null;

		for (const muteeId of toArray(body.muteeId)) {
			// Update muter's muting status
			const forwardRelation = this.userRelationsCache.getMaybe(`${body.muterId}:${muteeId}`);
			if (forwardRelation) {
				if (newMuting != null) forwardRelation.isMuting = newMuting;
				if (newMutingRenotes != null) forwardRelation.isMutingRenotes = newMutingRenotes;
			}

			// Update mutee's muting status
			const backRelation = this.userRelationsCache.getMaybe(`${muteeId}:${body.muterId}`);
			if (backRelation) {
				if (newMuting != null) backRelation.isMuted = newMuting;
				if (newMutingRenotes != null) backRelation.isMutedRenotes = newMutingRenotes;
			}
		}
	}

	@bindThis
	private onMemoEvent<E extends 'userMemoChanged'>(body: InternalEventTypes[E]): void {
		const relation = this.userRelationsCache.getMaybe(`${body.userId}:${body.targetUserId}`);
		if (relation) relation.memo = body.memo;
	}

	@bindThis
	public async findUserById(userId: MiUser['id']): Promise<MiUser> {
		const user = await this.findOptionalUserById(userId);

		if (user == null) {
			throw new IdentifiableError(errorCodes.userDeleted, `User ${userId} not found`);
		}

		return user;
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
		acct = acct.toLowerCase();

		const id = await this.userByAcctCache.fetch(acct);
		return await this.findUserById(id);
	}

	@bindThis
	public async findOptionalUserByAcct(acct: string | Acct.Acct): Promise<MiUser | undefined> {
		acct = typeof(acct) === 'string' ? acct : Acct.toString(acct);
		acct = acct.toLowerCase();

		const id = await this.userByAcctCache.fetchMaybe(acct);
		if (id == null) return undefined;

		return await this.findOptionalUserById(id);
	}

	@bindThis
	public async findUsersByAcct(accounts: (string | Acct.Acct)[]): Promise<Map<string, MiUser>> {
		const keys = accounts.map(a => typeof(a) === 'string' ? a.toLowerCase() : Acct.toString(a));

		const ids = await this.userByAcctCache.fetchMany(keys);
		return await this.findUsersById(ids.values);
	}

	@bindThis
	public async findLocalUserByUsername(username: string): Promise<MiLocalUser> {
		return await this.findUserByAcct({ username: username.toLowerCase(), host: null }) as MiLocalUser;
	}

	@bindThis
	public async findOptionalLocalUserByUsername(username: string): Promise<MiLocalUser | undefined> {
		return await this.findOptionalUserByAcct({ username: username.toLowerCase(), host: null }) as MiLocalUser | undefined;
	}

	@bindThis
	public async findLocalUserById(userId: MiUser['id']): Promise<MiLocalUser> {
		const user = await this.findUserById(userId);

		if (!isLocalUser(user)) {
			throw new IdentifiableError(errorCodes.userNotLocal, `User ${userId} is not local`);
		}

		return user;
	}

	@bindThis
	public async findOptionalLocalUserById(userId: MiUser['id']): Promise<MiLocalUser | undefined> {
		const user = await this.findOptionalUserById(userId);

		if (user && !isLocalUser(user)) {
			throw new IdentifiableError(errorCodes.userNotLocal, `User ${userId} is not local`);
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
			throw new IdentifiableError(errorCodes.userNotRemote, `User ${userId} is not remote`);
		}

		return user;
	}

	@bindThis
	public async findOptionalRemoteUserById(userId: MiUser['id']): Promise<MiRemoteUser | undefined> {
		const user = await this.findOptionalUserById(userId);

		if (user && !isRemoteUser(user)) {
			throw new IdentifiableError(errorCodes.userNotRemote, `User ${userId} is not remote`);
		}

		return user;
	}

	@bindThis
	public async findUserByUri(uri: string): Promise<MiUser> {
		const user = await this.findOptionalUserByUri(uri);

		if (user == null) {
			throw new IdentifiableError(errorCodes.userDeleted, `User ${uri} not found`);
		}

		return user;
	}

	@bindThis
	public async findOptionalUserByUri(uri: string): Promise<MiUser | undefined> {
		const userId = await this.uriPersonCache.fetchMaybe(uri);
		if (userId == null) {
			return undefined;
		}

		return await this.findOptionalUserById(userId);
	}

	@bindThis
	public async findLocalUserByUri(uri: string): Promise<MiLocalUser> {
		const user = await this.findUserByUri(uri);

		if (!isLocalUser(user)) {
			throw new IdentifiableError(errorCodes.userNotLocal, `User ${uri} is not local`);
		}

		return user;
	}

	@bindThis
	public async findOptionalLocalUserByUri(uri: string): Promise<MiLocalUser | undefined> {
		const user = await this.findOptionalUserByUri(uri);

		if (user && !isLocalUser(user)) {
			throw new IdentifiableError(errorCodes.userNotLocal, `User ${uri} is not local`);
		}

		return user;
	}

	@bindThis
	public async findRemoteUserByUri(uri: string): Promise<MiRemoteUser> {
		const user = await this.findUserByUri(uri);

		if (!isRemoteUser(user)) {
			throw new IdentifiableError(errorCodes.userNotRemote, `User ${uri} is not remote`);
		}

		return user;
	}

	@bindThis
	public async findOptionalRemoteUserByUri(uri: string): Promise<MiRemoteUser | undefined> {
		const user = await this.findOptionalUserByUri(uri);

		if (user && !isRemoteUser(user)) {
			throw new IdentifiableError(errorCodes.userNotRemote, `User ${uri} is not remote`);
		}

		return user;
	}

	/**
	 * Get a 1:1 user relation
	 * @param userOrId Source user
	 * @param targetUserOrId Target user
	 * @param hint Optional hints to speed up the fetch
	 */
	@bindThis
	public async getUserRelation(
		userOrId: Pick<MiUser, 'id'> | MiUser['id'],
		targetUserOrId: Pick<MiUser, 'id'> | MiUser['id'],
		hint?: {
			userRelation?: UserRelation,
			userRelations?: Map<string, UserRelation>,
		},
	): Promise<UserRelation> {
		const userId = typeof(userOrId) === 'object' ? userOrId.id : userOrId;
		const targetUserId = typeof(targetUserOrId) === 'object' ? targetUserOrId.id : targetUserOrId;

		let userRelation = hint?.userRelation ?? hint?.userRelations?.get(targetUserId);
		if (!userRelation) {
			const key = `${userId}:${targetUserId}`;
			userRelation = await this.userRelationsCache.fetch(key);
		}
		return userRelation;
	}

	/**
	 * Get a 1:N user relation
	 * @param userOrId Source user
	 * @param targetUsersOrIds Target users
	 * @param hint Optional hints to speed up the fetch
	 */
	@bindThis
	public async getUserRelations(
		userOrId: Pick<MiUser, 'id'> | MiUser['id'],
		targetUsersOrIds: Pick<MiUser, 'id'> | MiUser['id'] | (Pick<MiUser, 'id'> | MiUser['id'])[],
		hint?: {
			userRelations?: Map<string, UserRelation>,
			usersRelations?: Map<string, Map<string, UserRelation>>,
		},
	): Promise<Map<string, UserRelation>> {
		const userRelations = new Map<string, UserRelation>(hint?.userRelations);

		// Project IDs into a flat list of cache keys
		const keysToFetch = new Set<string>();
		const userId = typeof(userOrId) === 'object' ? userOrId.id : userOrId;
		const groupFromUsersRelations = hint?.usersRelations?.get(userId);
		for (const targetUserOrId of toArray(targetUsersOrIds)) {
			const targetUserId = typeof(targetUserOrId) === 'object' ? targetUserOrId.id : targetUserOrId;
			if (targetUserId === userId) continue;
			if (userRelations.has(targetUserId)) continue;

			const fromUsersRelations = groupFromUsersRelations?.get(targetUserId);
			if (fromUsersRelations) {
				userRelations.set(targetUserId, fromUsersRelations);
			} else {
				keysToFetch.add(`${userId}:${targetUserId}`);
			}
		}

		// Fetch any missing relations
		if (keysToFetch.size > 0) {
			const fetchedRelations = await this.userRelationsCache.fetchMany(keysToFetch);
			for (const relation of fetchedRelations.values) {
				userRelations.set(relation.targetUserId, relation);
			}
		}

		return userRelations;
	}

	/**
	 * Get an N:1 user relation
	 * @param usersOrIds Source users
	 * @param targetUserOrId Target user
	 * @param hint Optional hints to speed up the fetch
	 */
	@bindThis
	public async getUsersRelation(
		usersOrIds: Pick<MiUser, 'id'> | MiUser['id'] | (Pick<MiUser, 'id'> | MiUser['id'])[],
		targetUserOrId: Pick<MiUser, 'id'> | MiUser['id'],
		hint?: {
			usersRelation?: Map<string, UserRelation>,
			usersRelations?: Map<string, Map<string, UserRelation>>,
		},
	): Promise<Map<string, UserRelation>> {
		const usersRelation = new Map<string, UserRelation>(hint?.usersRelation);

		// Project IDs into a flat list of cache keys
		const keysToFetch = new Set<string>();
		const targetUserId = typeof(targetUserOrId) === 'object' ? targetUserOrId.id : targetUserOrId;
		for (const userOrId of toArray(usersOrIds)) {
			const userId = typeof(userOrId) === 'object' ? userOrId.id : userOrId;
			if (targetUserId === userId) continue;
			if (usersRelation.has(userId)) continue;

			const fromUsersRelations = hint?.usersRelations?.get(userId)?.get(targetUserId);
			if (fromUsersRelations) {
				usersRelation.set(userId, fromUsersRelations);
			} else {
				keysToFetch.add(`${userId}:${targetUserId}`);
			}
		}

		// Fetch any missing relations
		if (keysToFetch.size > 0) {
			const fetchedRelations = await this.userRelationsCache.fetchMany(keysToFetch);
			for (const relation of fetchedRelations.values) {
				usersRelation.set(relation.userId, relation);
			}
		}

		return usersRelation;
	}

	/**
	 * Get an N:N user relation
	 * @param usersOrIds Source user
	 * @param targetUsersOrIds Target users
	 * @param hint Optional hints to speed up the fetch
	 */
	@bindThis
	public async getUsersRelations(
		usersOrIds: Pick<MiUser, 'id'> | MiUser['id'] | (Pick<MiUser, 'id'> | MiUser['id'])[],
		targetUsersOrIds: Pick<MiUser, 'id'> | MiUser['id'] | (Pick<MiUser, 'id'> | MiUser['id'])[],
		hint?: {
			usersRelations?: Map<string, Map<string, UserRelation>>,
		},
	): Promise<Map<string, Map<string, UserRelation>>> {
		const usersRelations = new Map<string, Map<string, UserRelation>>(hint?.usersRelations);

		// Cross-multiply IDs into a flat list of cache keys
		const keysToFetch = new Set<string>();
		for (const userOrId of toArray(usersOrIds)) {
			const userId = typeof(userOrId) === 'object' ? userOrId.id : userOrId;
			const userRelations = usersRelations.get(userId);

			for (const targetUserOrId of toArray(targetUsersOrIds)) {
				const targetUserId = typeof(targetUserOrId) === 'object' ? targetUserOrId.id : targetUserOrId;
				if (targetUserId === userId) continue;
				if (userRelations?.has(targetUserId)) continue;

				keysToFetch.add(`${userId}:${targetUserId}`);
			}
		}

		// Fetch any missing relations
		if (keysToFetch.size > 0) {
			const fetchedRelations = await this.userRelationsCache.fetchMany(keysToFetch);
			for (const userRelation of fetchedRelations.values) {
				let group = usersRelations.get(userRelation.userId);
				if (group == null) {
					group = new Map();
					usersRelations.set(userRelation.userId, group);
				}
				group.set(userRelation.targetUserId, userRelation);
			}
		}

		return usersRelations;
	}

	@bindThis
	public async getFollowStats(userId: MiUser['id']): Promise<FollowStats> {
		return await this.userFollowStatsCache.fetch(userId, async () => {
			const [localFollowing, remoteFollowing, localFollowers, remoteFollowers, user] = await Promise.all([
				this.followingsRepository.countBy({ followerId: userId, followeeHost: IsNull() }),
				this.followingsRepository.countBy({ followerId: userId, followeeHost: Not(IsNull()) }),
				this.followingsRepository.countBy({ followeeId: userId, followerHost: IsNull() }),
				this.followingsRepository.countBy({ followeeId: userId, followerHost: Not(IsNull()) }),
				this.findUserById(userId),
			]);

			return {
				localFollowing,
				localFollowers,
				// Infer remote-remote followers heuristically, since we don't track that info directly.
				remoteFollowing: Math.max(0, remoteFollowing, user.followingCount - localFollowing),
				remoteFollowers: Math.max(0, remoteFollowers, user.followersCount - localFollowers),
			};
		});
	}

	@bindThis
	public async isFollowing(follower: string | { id: string }, followee: string | { id: string }): Promise<boolean> {
		const followerId = typeof(follower) === 'string' ? follower : follower.id;
		const followeeId = typeof(followee) === 'string' ? followee : followee.id;

		// Try cached back-ref
		const backRelations = this.userRelationsCache.getMaybe(`${followeeId}:${followerId}`);
		if (backRelations) {
			return !!backRelations.isFollowed;
		}

		// Try cached or fetch new forward-ref
		const forwardRelations = await this.userRelationsCache.fetch(`${followerId}:${followeeId}`);
		return !!forwardRelations.isFollowing;
	}

	@bindThis
	public async clear(): Promise<void> {
		await this.cacheManagementService.clear();
	}

	@bindThis
	public dispose(): void {
		this.internalEventService.off('follow', this.onFollowEvent);
		this.internalEventService.off('unfollow', this.onFollowEvent);
		this.internalEventService.off('followChanged', this.onFollowChangedEvent);
		this.internalEventService.off('followRequested', this.onFollowRequestEvent);
		this.internalEventService.off('followRequestCancelled', this.onFollowRequestEvent);
		this.internalEventService.off('blockingCreated', this.onBlockingEvent);
		this.internalEventService.off('blockingDeleted', this.onBlockingEvent);
		this.internalEventService.off('userChangeHibernatedState', this.onHibernationEvent);
		this.internalEventService.off('mute', this.onMuteEvent);
		this.internalEventService.off('unmute', this.onMuteEvent);
		this.internalEventService.off('muteRenotes', this.onMuteEvent);
		this.internalEventService.off('unmuteRenotes', this.onMuteEvent);
		this.internalEventService.off('userMemoChanged', this.onMemoEvent);

		this.internalEventService.off('usersUpdated', this.onUserChangeEvent);
		this.internalEventService.off('userChangeSuspendedState', this.onUserChangeEvent);
		this.internalEventService.off('remoteUserUpdated', this.onUserChangeEvent);
		this.internalEventService.off('localUserUpdated', this.onUserChangeEvent);
		this.internalEventService.off('userUpdated', this.onUserChangeEvent);
		this.internalEventService.off('userTokenRegenerated', this.onTokenEvent);
		this.internalEventService.off('userChangeDeletedState', this.onUserDeleteEvent);
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
