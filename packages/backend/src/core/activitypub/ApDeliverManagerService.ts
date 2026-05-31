/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull, Not } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { FollowingsRepository } from '@/models/_.js';
import type { MiLocalUser, MiRemoteUser, MiUser } from '@/models/User.js';
import { QueueService } from '@/core/QueueService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import type { IActivity } from '@/core/activitypub/type.js';
import { ThinUser } from '@/queue/types.js';
import { CacheManagementService, type ManagedMemorySingleCache } from '@/global/CacheManagementService.js';

interface IRecipe {
	type: string;
}

interface IFollowersRecipe extends IRecipe {
	type: 'Followers';
}

interface IDirectRecipe extends IRecipe {
	type: 'Direct';
	to: MiRemoteUser;
}

interface INetworkRecipe extends IRecipe {
	type: 'Network';
}

const isFollowers = (recipe: IRecipe): recipe is IFollowersRecipe =>
	recipe.type === 'Followers';

const isDirect = (recipe: IRecipe): recipe is IDirectRecipe =>
	recipe.type === 'Direct';

const isNetwork = (recipe: IRecipe): recipe is INetworkRecipe =>
	recipe.type === 'Network';

class DeliverManager {
	private actor: ThinUser;
	private activity: IActivity | null;
	private recipes: IRecipe[] = [];

	/**
	 * Constructor
	 * @param networkCache
	 * @param followingsRepository
	 * @param queueService
	 * @param actor Actor
	 * @param activity Activity to deliver
	 */
	constructor(
		private readonly networkCache: ManagedMemorySingleCache<{ sharedInbox: string }[]>,
		private followingsRepository: FollowingsRepository,
		private queueService: QueueService,

		actor: { id: MiUser['id']; host: null; },
		activity: IActivity | null,
	) {
		// TODO utilityService.assertActiveLocalUser
		// 型で弾いてはいるが一応ローカルユーザーかチェック
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (actor.host != null) throw new Error(`deliver failed for ${actor.id}: host is not null`);

		// パフォーマンス向上のためキューに突っ込むのはidのみに絞る
		this.actor = {
			id: actor.id,
		};
		this.activity = activity;
	}

	/**
	 * Add recipe for followers deliver
	 */
	@bindThis
	public addFollowersRecipe(): void {
		const deliver: IFollowersRecipe = {
			type: 'Followers',
		};

		this.addRecipe(deliver);
	}

	/**
	 * Add recipe for direct deliver
	 * @param to To
	 */
	@bindThis
	public addDirectRecipe(to: MiRemoteUser): void {
		const recipe: IDirectRecipe = {
			type: 'Direct',
			to,
		};

		this.addRecipe(recipe);
	}

	/**
	 * Add recipe for known-network deliver
	 */
	@bindThis
	public addNetworkRecipe(): void {
		const recipe: INetworkRecipe = {
			type: 'Network',
		};

		this.addRecipe(recipe);
	}

	/**
	 * Add recipe
	 * @param recipe Recipe
	 */
	@bindThis
	public addRecipe(recipe: IRecipe): void {
		this.recipes.push(recipe);
	}

	/**
	 * Execute delivers
	 */
	@bindThis
	public async execute(): Promise<void> {
		// The value flags whether it is shared or not.
		// key: inbox URL, value: whether it is sharedInbox
		const inboxes = new Map<string, boolean>();

		// Process network recipe first so that later recipes can override / extend
		if (this.recipes.some(r => isNetwork(r))) {
			const sharedInboxes = await this.networkCache.fetch(async () => {
				const followings = await this.followingsRepository.find({
					where: [
						{ followerSharedInbox: Not(IsNull()), isFollowerHibernated: false },
						{ followeeSharedInbox: Not(IsNull()), isFollowerHibernated: false },
					],
					select: ['followerSharedInbox', 'followeeSharedInbox'],
				});

				return followings.map(f => ({
					sharedInbox: (f.followerSharedInbox ?? f.followeeSharedInbox) as string,
				}));
			});

			for (const { sharedInbox } of sharedInboxes) {
				inboxes.set(sharedInbox, true);
			}
		}

		// build inbox list
		// Process follower recipes first to avoid duplication when processing direct recipes later.
		if (this.recipes.some(r => isFollowers(r))) {
			// followers deliver
			// TODO: SELECT DISTINCT ON ("followerSharedInbox") "followerSharedInbox" みたいな問い合わせにすればよりパフォーマンス向上できそう
			// ただ、sharedInboxがnullなリモートユーザーも稀におり、その対応ができなさそう？
			const followers = await this.followingsRepository.find({
				where: {
					followeeId: this.actor.id,
					followerHost: Not(IsNull()),
					isFollowerHibernated: false,
				},
				select: {
					followerSharedInbox: true,
					followerInbox: true,
					followerId: true,
				},
			});

			for (const following of followers) {
				if (following.followerSharedInbox) {
					inboxes.set(following.followerSharedInbox, true);
				} else if (following.followerInbox) {
					inboxes.set(following.followerInbox, false);
				}
			}
		}

		for (const recipe of this.recipes.filter(isDirect)) {
			// check that shared inbox has not been added yet
			if (recipe.to.sharedInbox !== null && inboxes.has(recipe.to.sharedInbox)) continue;

			// check that they actually have an inbox
			if (recipe.to.inbox === null) continue;

			inboxes.set(recipe.to.inbox, false);
		}

		// deliver
		await this.queueService.deliverMany(this.actor, this.activity, inboxes);
	}
}

@Injectable()
export class ApDeliverManagerService {
	private readonly networkCache: ManagedMemorySingleCache<{ sharedInbox: string }[]>;

	constructor(
		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private queueService: QueueService,

		cacheManagementService: CacheManagementService,
	) {
		this.networkCache = cacheManagementService.createMemorySingleCache<{ sharedInbox: string }[]>('network', { lifetime: 1000 * 30 }); // 30 seconds
	}

	/**
	 * Deliver activity to followers
	 * @param actor
	 * @param activity Activity
	 */
	@bindThis
	public async deliverToFollowers(actor: { id: MiLocalUser['id']; host: null; }, activity: IActivity): Promise<void> {
		const manager = new DeliverManager(
			this.networkCache,
			this.followingsRepository,
			this.queueService,
			actor,
			activity,
		);
		manager.addFollowersRecipe();
		await manager.execute();
	}

	/**
	 * Deliver activity to user
	 * @param actor
	 * @param activity Activity
	 * @param to Target user
	 */
	@bindThis
	public async deliverToUser(actor: { id: MiLocalUser['id']; host: null; }, activity: IActivity, to: MiRemoteUser): Promise<void> {
		const manager = new DeliverManager(
			this.networkCache,
			this.followingsRepository,
			this.queueService,
			actor,
			activity,
		);
		manager.addDirectRecipe(to);
		await manager.execute();
	}

	/**
	 * Deliver activity to users
	 * @param actor
	 * @param activity Activity
	 * @param targets Target users
	 */
	@bindThis
	public async deliverToUsers(actor: { id: MiLocalUser['id']; host: null; }, activity: IActivity, targets: MiRemoteUser[]): Promise<void> {
		const manager = new DeliverManager(
			this.networkCache,
			this.followingsRepository,
			this.queueService,
			actor,
			activity,
		);
		for (const to of targets) manager.addDirectRecipe(to);
		await manager.execute();
	}

	@bindThis
	public createDeliverManager(actor: { id: MiUser['id']; host: null; }, activity: IActivity | null): DeliverManager {
		return new DeliverManager(
			this.networkCache,
			this.followingsRepository,
			this.queueService,

			actor,
			activity,
		);
	}
}
