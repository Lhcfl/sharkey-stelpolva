/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { FollowingsRepository } from '@/models/_.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { Packed } from '@/misc/json-schema.js';
import { MiBlocking } from '@/models/Blocking.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { MiFollowing } from '@/models/Following.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { QueryService } from '@/core/QueryService.js';
import { RoleService } from '@/core/RoleService.js';
import { UserEntityService } from './UserEntityService.js';

type LocalFollowerFollowing = MiFollowing & {
	followerHost: null;
	followerInbox: null;
	followerSharedInbox: null;
};

type RemoteFollowerFollowing = MiFollowing & {
	followerHost: string;
	followerInbox: string;
	followerSharedInbox: string;
};

type LocalFolloweeFollowing = MiFollowing & {
	followeeHost: null;
	followeeInbox: null;
	followeeSharedInbox: null;
};

type RemoteFolloweeFollowing = MiFollowing & {
	followeeHost: string;
	followeeInbox: string;
	followeeSharedInbox: string;
};

@Injectable()
export class FollowingEntityService {
	constructor(
		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private userEntityService: UserEntityService,
		private idService: IdService,
		private queryService: QueryService,
		private roleService: RoleService,
	) {
	}

	@bindThis
	public isLocalFollower(following: MiFollowing): following is LocalFollowerFollowing {
		return following.followerHost == null;
	}

	@bindThis
	public isRemoteFollower(following: MiFollowing): following is RemoteFollowerFollowing {
		return following.followerHost != null;
	}

	@bindThis
	public isLocalFollowee(following: MiFollowing): following is LocalFolloweeFollowing {
		return following.followeeHost == null;
	}

	@bindThis
	public isRemoteFollowee(following: MiFollowing): following is RemoteFolloweeFollowing {
		return following.followeeHost != null;
	}

	@bindThis
	public async getFollowing(me: MiLocalUser, params: FollowsQueryParams) {
		return await this.getFollows(me, params, 'following.followerHost = :host');
	}

	@bindThis
	public async getFollowers(me: MiLocalUser, params: FollowsQueryParams) {
		return await this.getFollows(me, params, 'following.followeeHost = :host');
	}

	private async getFollows(me: MiLocalUser, params: FollowsQueryParams, condition: string) {
		const builder = this.followingsRepository.createQueryBuilder('following');
		const query = this.queryService
			.makePaginationQuery(builder, params.sinceId, params.untilId)
			.andWhere(condition, { host: params.host })
			.limit(params.limit);

		if (!await this.roleService.isModerator(me)) {
			query.setParameter('me', me.id);

			// Make sure that the followee doesn't block us, if their profile will be included.
			if (params.includeFollowee) {
				query.leftJoin(MiBlocking, 'followee_blocking', 'followee_blocking."blockerId" = following."followeeId" AND followee_blocking."blockeeId" = :me');
				query.andWhere('followee_blocking.id IS NULL');
			}

			// Make sure that the follower doesn't block us, if their profile will be included.
			if (params.includeFollower) {
				query.leftJoin(MiBlocking, 'follower_blocking', 'follower_blocking."blockerId" = following."followerId" AND follower_blocking."blockeeId" = :me');
				query.andWhere('follower_blocking.id IS NULL');
			}

			// Make sure that the followee hasn't hidden this connection.
			query.leftJoin(MiUserProfile, 'followee', 'followee."userId" = following."followeeId"');
			query.leftJoin(MiFollowing, 'me_following_followee', 'me_following_followee."followerId" = :me AND me_following_followee."followeeId" = following."followerId"');
			query.andWhere('(followee."userId" = :me OR followee."followersVisibility" = \'public\' OR (followee."followersVisibility" = \'followers\' AND me_following_followee.id IS NOT NULL))');

			// Make sure that the follower hasn't hidden this connection.
			query.leftJoin(MiUserProfile, 'follower', 'follower."userId" = following."followerId"');
			query.leftJoin(MiFollowing, 'me_following_follower', 'me_following_follower."followerId" = :me AND me_following_follower."followeeId" = following."followerId"');
			query.andWhere('(follower."userId" = :me OR follower."followingVisibility" = \'public\' OR (follower."followingVisibility" = \'followers\' AND me_following_follower.id IS NOT NULL))');
		}

		const followings = await query.getMany();
		return await this.packMany(followings, me, { populateFollowee: params.includeFollowee, populateFollower: params.includeFollower });
	}

	@bindThis
	public async pack(
		src: MiFollowing['id'] | MiFollowing,
		me?: { id: MiUser['id'] } | null | undefined,
		opts?: {
			populateFollowee?: boolean;
			populateFollower?: boolean;
		},
		hint?: {
			packedFollowee?: Packed<'UserDetailedNotMe'>,
			packedFollower?: Packed<'UserDetailedNotMe'>,
		},
	): Promise<Packed<'Following'>> {
		const following = typeof src === 'object' ? src : await this.followingsRepository.findOneByOrFail({ id: src });

		if (opts == null) opts = {};

		// noinspection ES6MissingAwait
		return await awaitAll({
			id: following.id,
			createdAt: this.idService.parse(following.id).date.toISOString(),
			followeeId: following.followeeId,
			followerId: following.followerId,
			followee: opts.populateFollowee ? hint?.packedFollowee ?? this.userEntityService.pack(following.followee ?? following.followeeId, me, {
				schema: 'UserDetailedNotMe',
			}) : undefined,
			follower: opts.populateFollower ? hint?.packedFollower ?? this.userEntityService.pack(following.follower ?? following.followerId, me, {
				schema: 'UserDetailedNotMe',
			}) : undefined,
		});
	}

	@bindThis
	public async packMany(
		followings: MiFollowing[],
		me?: { id: MiUser['id'] } | null | undefined,
		opts?: {
			populateFollowee?: boolean;
			populateFollower?: boolean;
		},
	) {
		const _followees = opts?.populateFollowee ? followings.map(({ followee, followeeId }) => followee ?? followeeId) : [];
		const _followers = opts?.populateFollower ? followings.map(({ follower, followerId }) => follower ?? followerId) : [];
		const _userMap = await this.userEntityService.packMany([..._followees, ..._followers], me, { schema: 'UserDetailedNotMe' })
			.then(users => new Map(users.map(u => [u.id, u])));
		return await Promise.all(
			followings.map(following => {
				const packedFollowee = opts?.populateFollowee ? _userMap.get(following.followeeId) : undefined;
				const packedFollower = opts?.populateFollower ? _userMap.get(following.followerId) : undefined;
				return this.pack(following, me, opts, { packedFollowee, packedFollower });
			}),
		);
	}
}

interface FollowsQueryParams {
	readonly host: string;
	readonly limit: number;
	readonly includeFollower: boolean;
	readonly includeFollowee: boolean;

	readonly sinceId?: string;
	readonly untilId?: string;
}
