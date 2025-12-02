/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull, In, MoreThan, Not } from 'typeorm';

import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import type { MiLocalUser, MiRemoteUser, MiUser } from '@/models/User.js';
import { isLocalUser } from '@/models/User.js';
import type { BlockingsRepository, FollowingsRepository, InstancesRepository, MiMeta, MutingsRepository, UserListMembershipsRepository, UsersRepository, NoteScheduleRepository, MiNoteSchedule } from '@/models/_.js';
import type { RelationshipJobData, ThinUser } from '@/queue/types.js';

import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { QueueService } from '@/core/QueueService.js';
import { RelayService } from '@/core/RelayService.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import PerUserFollowingChart from '@/core/chart/charts/per-user-following.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { RoleService } from '@/core/RoleService.js';
import { AntennaService } from '@/core/AntennaService.js';
import { CacheService } from '@/core/CacheService.js';
import { UserListService } from '@/core/UserListService.js';
import { TimeService } from '@/global/TimeService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import type { Packed } from '@/misc/json-schema.js';
import type { Config } from '@/config.js';

@Injectable()
export class AccountMoveService {
	private readonly logger: Logger;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.config)
		private readonly config: Config,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.blockingsRepository)
		private blockingsRepository: BlockingsRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		@Inject(DI.userListMembershipsRepository)
		private userListMembershipsRepository: UserListMembershipsRepository,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		@Inject(DI.noteScheduleRepository)
		private noteScheduleRepository: NoteScheduleRepository,

		private userEntityService: UserEntityService,
		private idService: IdService,
		private apPersonService: ApPersonService,
		private apRendererService: ApRendererService,
		private apDeliverManagerService: ApDeliverManagerService,
		private globalEventService: GlobalEventService,
		private perUserFollowingChart: PerUserFollowingChart,
		private federatedInstanceService: FederatedInstanceService,
		private instanceChart: InstanceChart,
		private relayService: RelayService,
		private queueService: QueueService,
		private systemAccountService: SystemAccountService,
		private roleService: RoleService,
		private antennaService: AntennaService,
		private readonly cacheService: CacheService,
		private readonly userListService: UserListService,
		private readonly timeService: TimeService,
		private readonly internalEventService: InternalEventService,
		private readonly loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('account-move');
	}

	@bindThis
	public async restartMigration(src: MiUser): Promise<void> {
		if (!src.movedToUri) {
			throw new IdentifiableError('ddcf173a-00f2-4aa4-ba12-cddd131bacf4', `Can't restart migrated for user ${src.id}: user has not migrated`);
		}

		const dst = await this.apPersonService.resolvePerson(src.movedToUri);
		this.logger.info(`Restarting migration from ${src.id} (@${src.usernameLower}@${src.host ?? this.config.host}) to ${dst.id} (@${dst.usernameLower}@${dst.host ?? this.config.host})`);

		if (isLocalUser(src)) {
			// This calls createMoveJob at the end
			await this.moveFromLocal(src, dst);
		} else {
			await this.queueService.createMoveJob(src, dst);
		}
	}

	/**
	 * Move a local account to a new account.
	 *
	 * After delivering Move activity, its local followers unfollow the old account and then follow the new one.
	 */
	@bindThis
	public async moveFromLocal(src: MiLocalUser, dst: MiLocalUser | MiRemoteUser): Promise<Packed<'MeDetailed'>> {
		const srcUri = this.userEntityService.getUserUri(src);
		const dstUri = this.userEntityService.getUserUri(dst);

		// add movedToUri to indicate that the user has moved
		const update = {} as Partial<MiLocalUser>;
		update.alsoKnownAs = src.alsoKnownAs?.includes(dstUri) ? src.alsoKnownAs : src.alsoKnownAs?.concat([dstUri]) ?? [dstUri];
		update.movedToUri = dstUri;
		update.movedAt = this.timeService.date;
		await this.usersRepository.update(src.id, update);
		Object.assign(src, update);

		// Update cache
		await this.internalEventService.emit('localUserUpdated', { id: src.id });

		const srcPerson = await this.apRendererService.renderPerson(src);
		const updateAct = this.apRendererService.addContext(this.apRendererService.renderUpdate(srcPerson, src));
		await this.apDeliverManagerService.deliverToFollowers(src, updateAct);
		await this.relayService.deliverToRelays(src, updateAct);

		// Deliver Move activity to the followers of the old account
		const moveAct = this.apRendererService.addContext(this.apRendererService.renderMove(src, dst));
		await this.apDeliverManagerService.deliverToFollowers(src, moveAct);
		await this.relayService.deliverToRelays(src, moveAct);

		// Publish meUpdated event
		const iObj = await this.userEntityService.pack(src.id, src, { schema: 'MeDetailed', includeSecrets: true });
		this.globalEventService.publishMainStream(src.id, 'meUpdated', iObj);

		// Unfollow after 24 hours
		const followings = await this.cacheService.userFollowingsCache.fetch(src.id);
		await this.queueService.createDelayedUnfollowJob(Array.from(followings.keys()).map(followeeId => ({
			from: { id: src.id },
			to: { id: followeeId },
		})), process.env.NODE_ENV === 'test' ? 10000 : 1000 * 60 * 60 * 24);

		await this.queueService.createMoveJob(src, dst);

		return iObj;
	}

	@bindThis
	public async postMoveProcess(src: MiUser, dst: MiUser): Promise<void> {
		// Copy blockings and mutings, and update lists
		await this.copyBlocking(src, dst)
			.catch(err => this.logger.warn(`Error copying blockings in migration ${src.id} (@${src.usernameLower}@${src.host ?? this.config.host}) to ${dst.id} (@${dst.usernameLower}@${dst.host ?? this.config.host}): ${renderInlineError(err)}`));
		await this.copyMutings(src, dst)
			.catch(err => this.logger.warn(`Error copying mutings in migration ${src.id} (@${src.usernameLower}@${src.host ?? this.config.host}) to ${dst.id} (@${dst.usernameLower}@${dst.host ?? this.config.host}): ${renderInlineError(err)}`));
		await this.deleteScheduledNotes(src)
			.catch(err => this.logger.warn(`Error deleting scheduled notes in migration ${src.id} (@${src.usernameLower}@${src.host ?? this.config.host}) to ${dst.id} (@${dst.usernameLower}@${dst.host ?? this.config.host}): ${renderInlineError(err)}`));
		await this.copyRoles(src, dst)
			.catch(err => this.logger.warn(`Error copying roles in migration ${src.id} (@${src.usernameLower}@${src.host ?? this.config.host}) to ${dst.id} (@${dst.usernameLower}@${dst.host ?? this.config.host}): ${renderInlineError(err)}`));
		await this.updateLists(src, dst)
			.catch(err => this.logger.warn(`Error updating lists in migration ${src.id} (@${src.usernameLower}@${src.host ?? this.config.host}) to ${dst.id} (@${dst.usernameLower}@${dst.host ?? this.config.host}): ${renderInlineError(err)}`));
		await this.antennaService.onMoveAccount(src, dst)
			.catch(err => this.logger.warn(`Error updating antennas in migration ${src.id} (@${src.usernameLower}@${src.host ?? this.config.host}) to ${dst.id} (@${dst.usernameLower}@${dst.host ?? this.config.host}): ${renderInlineError(err)}`));

		// follow the new account
		const proxy = await this.systemAccountService.fetch('proxy');
		const followings = await this.cacheService.userFollowersCache.fetch(src.id)
			.then(fs => Array.from(fs.values())
				.filter(f => f.followerHost == null && f.followerId !== proxy.id));
		const followJobs = followings.map(following => ({
			from: { id: following.followerId },
			to: { id: dst.id },
		})) as RelationshipJobData[];

		// Decrease following count instead of unfollowing.
		try {
			await this.adjustFollowingCounts(followJobs.map(job => job.from.id), src);
		} catch (err) {
			/* skip if any error happens */
			this.logger.warn(`Non-fatal exception in migration from ${src.id} (@${src.usernameLower}@${src.host ?? this.config.host}) to ${dst.id} (@${dst.usernameLower}@${dst.host ?? this.config.host}): ${renderInlineError(err)}`);
		}

		// Should be queued because this can cause a number of follow per one move.
		await this.queueService.createFollowJob(followJobs);
	}

	@bindThis
	public async copyBlocking(src: ThinUser, dst: ThinUser): Promise<void> {
		// Followers shouldn't overlap with blockers, but the destination account, different from the blockee (i.e., old account), may have followed the local user before moving.
		// So block the destination account here.
		const [srcBlockers, dstBlockers, dstFollowers] = await Promise.all([
			this.cacheService.userBlockedCache.fetch(src.id),
			this.cacheService.userBlockedCache.fetch(dst.id),
			this.cacheService.userFollowersCache.fetch(dst.id),
		]);
		// reblock the destination account
		const blockJobs: RelationshipJobData[] = [];
		for (const blockerId of srcBlockers) {
			if (dstBlockers.has(blockerId)) continue; // skip if already blocked
			if (dstFollowers.has(blockerId)) continue; // skip if already following
			blockJobs.push({ from: { id: blockerId }, to: { id: dst.id } });
		}
		// no need to unblock the old account because it may be still functional
		await this.queueService.createBlockJob(blockJobs);
	}

	@bindThis
	public async copyMutings(src: ThinUser, dst: ThinUser): Promise<void> {
		// Insert new mutings with the same values except mutee
		const oldMutings = await this.mutingsRepository.findBy([
			{ muteeId: src.id, expiresAt: IsNull() },
			{ muteeId: src.id, expiresAt: MoreThan(this.timeService.date) },
		]);
		if (oldMutings.length === 0) return;

		// Check if the destination account is already indefinitely muted by the muter
		const [existingMutingsMuterUserIds, dstFollowers] = await Promise.all([
			this.mutingsRepository.findBy(
				{ muteeId: dst.id, expiresAt: IsNull() },
			).then(mutings => mutings.map(muting => muting.muterId)),
			this.cacheService.userFollowersCache.fetch(dst.id),
		]);

		const newMutings: Map<string, { muterId: string; muteeId: string; expiresAt: Date | null; }> = new Map();

		// 重複しないようにIDを生成
		const genId = (): string => {
			let id: string;
			do {
				id = this.idService.gen();
			} while (newMutings.has(id));
			return id;
		};
		for (const muting of oldMutings) {
			if (existingMutingsMuterUserIds.includes(muting.muterId)) continue; // skip if already muted indefinitely
			if (dstFollowers.has(muting.muterId)) continue; // skip if already following
			newMutings.set(genId(), {
				...muting,
				muteeId: dst.id,
			});
		}

		const arrayToInsert = Array.from(newMutings.entries()).map(entry => ({ ...entry[1], id: entry[0] }));
		await this.mutingsRepository.insert(arrayToInsert);
	}

	@bindThis
	public async deleteScheduledNotes(src: ThinUser): Promise<void> {
		const scheduledNotes = await this.noteScheduleRepository.findBy({
			userId: src.id,
		}) as MiNoteSchedule[];

		for (const note of scheduledNotes) {
			await this.queueService.ScheduleNotePostQueue.remove(`schedNote:${note.id}`);
		}

		await this.noteScheduleRepository.delete({
			userId: src.id,
		});
	}

	@bindThis
	public async copyRoles(src: ThinUser, dst: ThinUser): Promise<void> {
		// Insert new roles with the same values except userId
		// role service may have cache for roles so retrieve roles from service
		const [oldRoleAssignments, roles] = await Promise.all([
			this.roleService.getUserAssigns(src.id),
			this.roleService.getRoles(),
		]);

		if (oldRoleAssignments.length === 0) return;

		// No promise all since the only async operation is writing to the database
		for (const oldRoleAssignment of oldRoleAssignments) {
			const role = roles.find(x => x.id === oldRoleAssignment.roleId);
			if (role == null) continue; // Very unlikely however removing role may cause this case
			if (!role.preserveAssignmentOnMoveAccount) continue;

			try {
				await this.roleService.assign(dst.id, role.id, oldRoleAssignment.expiresAt);
			} catch (e) {
				if (e instanceof RoleService.AlreadyAssignedError) continue;
				throw e;
			}
		}
	}

	/**
	 * Update lists while moving accounts.
	 *   - No removal of the old account from the lists
	 *   - Users number limit is not checked
	 *
	 * @param src ThinUser (old account)
	 * @param dst User (new account)
	 * @returns Promise<void>
	 */
	@bindThis
	public async updateLists(src: ThinUser, dst: MiUser): Promise<void> {
		// Return if there is no list to be updated.
		const [srcMemberships, dstMemberships] = await Promise.all([
			this.cacheService.userListMembershipsCache.fetch(src.id),
			this.cacheService.userListMembershipsCache.fetch(dst.id),
		]);
		if (srcMemberships.size === 0) return;

		const newMemberships = srcMemberships.values()
			.filter(srcMembership => !dstMemberships.has(srcMembership.userListId))
			.map(srcMembership => ({
				userListId: srcMembership.userListId,
				withReplies: srcMembership.withReplies,
			}))
			.toArray();
		const updatedMemberships = srcMemberships.values()
			.filter(srcMembership => {
				const dstMembership = dstMemberships.get(srcMembership.userListId);
				return dstMembership != null && dstMembership.withReplies !== srcMembership.withReplies;
			})
			.map(srcMembership => ({
				userListId: srcMembership.userListId,
				withReplies: srcMembership.withReplies,
			}))
			.toArray();

		if (newMemberships.length > 0) {
			await this.userListService.bulkAddMember(dst, newMemberships);
		}
		if (updatedMemberships.length > 0) {
			await this.userListService.bulkUpdateMembership(dst, updatedMemberships);
		}
	}

	@bindThis
	private async adjustFollowingCounts(localFollowerIds: string[], oldAccount: MiUser): Promise<void> {
		if (localFollowerIds.length === 0) return;

		// Set the old account's following and followers counts to 0.
		// TODO use CollapsedQueueService when merged
		await this.usersRepository.update({ id: oldAccount.id }, { followersCount: 0, followingCount: 0 });
		await this.internalEventService.emit(oldAccount.host == null ? 'localUserUpdated' : 'remoteUserUpdated', { id: oldAccount.id });

		// Decrease following counts of local followers by 1.
		// TODO use CollapsedQueueService when merged
		await this.usersRepository.decrement({ id: In(localFollowerIds) }, 'followingCount', 1);
		await this.internalEventService.emit('usersUpdated', { ids: localFollowerIds });

		// Decrease follower counts of local followees by 1.
		const oldFollowings = await this.cacheService.userFollowingsCache.fetch(oldAccount.id);
		const oldFolloweeIds = Array.from(oldFollowings.keys());
		if (oldFolloweeIds.length > 0) {
			// TODO use CollapsedQueueService when merged
			await this.usersRepository.decrement({ id: In(oldFolloweeIds) }, 'followersCount', 1);
			await this.internalEventService.emit('usersUpdated', { ids: oldFolloweeIds });
		}

		// Update instance stats by decreasing remote followers count by the number of local followers who were following the old account.
		if (this.meta.enableStatsForFederatedInstances) {
			if (this.userEntityService.isRemoteUser(oldAccount)) {
				// TODO use CollapsedQueueService when merged
				await this.federatedInstanceService.fetchOrRegister(oldAccount.host).then(async i => {
					await this.instancesRepository.decrement({ id: i.id }, 'followersCount', localFollowerIds.length);
					if (this.meta.enableChartsForFederatedInstances) {
						this.instanceChart.updateFollowers(i.host, false);
					}
				});
			}
		}

		// FIXME: expensive?
		for (const followerId of localFollowerIds) {
			this.perUserFollowingChart.update({ id: followerId, host: null }, oldAccount, false);
		}
	}

	/**
	 * dstユーザーのalsoKnownAsをfetchPersonしていき、本当にmovedToUrlをdstに指定するユーザーが存在するのかを調べる
	 *
	 * @param dst movedToUrlを指定するユーザー
	 * @param check
	 * @param instant checkがtrueであるユーザーが最初に見つかったら即座にreturnするかどうか
	 * @returns Promise<LocalUser | RemoteUser | null>
	 */
	@bindThis
	public async validateAlsoKnownAs(
		dst: MiLocalUser | MiRemoteUser,
		check: (oldUser: MiLocalUser | MiRemoteUser | null, newUser: MiLocalUser | MiRemoteUser) => boolean | Promise<boolean> = () => true,
		instant = false,
	): Promise<MiLocalUser | MiRemoteUser | null> {
		let resultUser: MiLocalUser | MiRemoteUser | null = null;

		if (this.userEntityService.isRemoteUser(dst)) {
			if (this.timeService.now - (dst.lastFetchedAt?.getTime() ?? 0) > 10 * 1000) {
				await this.apPersonService.updatePerson(dst.uri);
			}
			dst = await this.apPersonService.fetchPerson(dst.uri) ?? dst;
		}

		if (!dst.alsoKnownAs || dst.alsoKnownAs.length === 0) return null;

		const dstUri = this.userEntityService.getUserUri(dst);

		for (const srcUri of dst.alsoKnownAs) {
			try {
				let src = await this.apPersonService.fetchPerson(srcUri);
				if (!src) continue; // oldAccountを探してもこのサーバーに存在しない場合はフォロー関係もないということなのでスルー

				if (this.userEntityService.isRemoteUser(dst)) {
					if (this.timeService.now - (src.lastFetchedAt?.getTime() ?? 0) > 10 * 1000) {
						await this.apPersonService.updatePerson(srcUri);
					}

					src = await this.apPersonService.fetchPerson(srcUri) ?? src;
				}

				if (src.movedToUri === dstUri) {
					if (await check(resultUser, src)) {
						resultUser = src;
					}
					if (instant && resultUser) return resultUser;
				}
			} catch {
				/* skip if any error happens */
			}
		}

		return resultUser;
	}
}
