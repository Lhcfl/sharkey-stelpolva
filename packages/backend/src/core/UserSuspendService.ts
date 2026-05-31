/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Not, IsNull, type DataSource } from 'typeorm';
import type { MiUser, FollowingsRepository, UsersRepository } from '@/models/_.js';
import { QueueService } from '@/core/QueueService.js';
import { DI } from '@/di-symbols.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import { isSystemAccount } from '@/misc/is-system-account.js';
import { RelationshipJobData } from '@/queue/types.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { InternalEventService } from '@/global/InternalEventService.js';

@Injectable()
export class UserSuspendService {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.db)
		private db: DataSource,

		private userEntityService: UserEntityService,
		private queueService: QueueService,
		private apRendererService: ApRendererService,
		private moderationLogService: ModerationLogService,
		private readonly internalEventService: InternalEventService,
	) {}

	@bindThis
	public async suspend(user: MiUser, moderator: MiUser): Promise<void> {
		if (isSystemAccount(user)) throw new Error('cannot suspend a system account');

		await this.usersRepository.update(user.id, {
			isSuspended: true,
		});

		await this.internalEventService.emit(user.host == null ? 'localUserUpdated' : 'remoteUserUpdated', { id: user.id });

		await this.moderationLogService.log(moderator, 'suspend', {
			userId: user.id,
			userUsername: user.username,
			userHost: user.host,
		});

		await this.queueService.createPostSuspendJob(user.id);
	}

	@bindThis
	public async unsuspend(user: MiUser, moderator: MiUser): Promise<void> {
		await this.usersRepository.update(user.id, {
			isSuspended: false,
		});

		await this.internalEventService.emit(user.host == null ? 'localUserUpdated' : 'remoteUserUpdated', { id: user.id });

		await this.moderationLogService.log(moderator, 'unsuspend', {
			userId: user.id,
			userUsername: user.username,
			userHost: user.host,
		});

		await this.queueService.createPostUnsuspendJob(user.id);
	}

	@bindThis
	public async postSuspend(user: MiUser): Promise<void> {
		await this.internalEventService.emit('userChangeSuspendedState', { id: user.id, isSuspended: true });

		/*
		this.followRequestsRepository.delete({
			followeeId: user.id,
		});
		this.followRequestsRepository.delete({
			followerId: user.id,
		});
		*/

		if (this.userEntityService.isLocalUser(user)) {
			// 知り得る全SharedInboxにDelete配信
			const content = this.apRendererService.addContext(this.apRendererService.renderDelete(this.userEntityService.genLocalUserUri(user.id), user));

			const queue = new Map<string, boolean>();

			const followings = await this.followingsRepository.find({
				where: [
					{ followerSharedInbox: Not(IsNull()) },
					{ followeeSharedInbox: Not(IsNull()) },
				],
				select: ['followerSharedInbox', 'followeeSharedInbox'],
			});

			const inboxes = followings.map(x => x.followerSharedInbox ?? x.followeeSharedInbox);

			for (const inbox of inboxes) {
				if (inbox != null) {
					queue.set(inbox, true);
				}
			}

			await this.queueService.deliverMany(user, content, queue);
		}

		await this.freezeAll(user);
	}

	@bindThis
	public async postUnsuspend(user: MiUser): Promise<void> {
		await this.internalEventService.emit('userChangeSuspendedState', { id: user.id, isSuspended: false });

		if (this.userEntityService.isLocalUser(user)) {
			// 知り得る全SharedInboxにUndo Delete配信
			const content = this.apRendererService.addContext(this.apRendererService.renderUndo(this.apRendererService.renderDelete(this.userEntityService.genLocalUserUri(user.id), user), user));

			const queue = new Map<string, boolean>();

			const followings = await this.followingsRepository.find({
				where: [
					{ followerSharedInbox: Not(IsNull()) },
					{ followeeSharedInbox: Not(IsNull()) },
				],
				select: ['followerSharedInbox', 'followeeSharedInbox'],
			});

			const inboxes = followings.map(x => x.followerSharedInbox ?? x.followeeSharedInbox);

			for (const inbox of inboxes) {
				if (inbox != null) {
					queue.set(inbox, true);
				}
			}

			await this.queueService.deliverMany(user, content, queue);
		}

		await this.unFreezeAll(user);
	}

	@bindThis
	private async unFollowAll(follower: MiUser) {
		const followings = await this.followingsRepository.find({
			where: { followerId: follower.id, followeeHost: Not(IsNull()) },
			select: { followerId: true },
		});

		const jobs: Omit<RelationshipJobData, 'type'>[] = [];
		for (const following of followings) {
			if (following.followeeId) {
				jobs.push({
					from: { id: follower.id },
					to: { id: following.followeeId },
					silent: true,
				});
			}
		}
		await this.queueService.createUnfollowJob(jobs);
	}

	@bindThis
	private async freezeAll(user: MiUser): Promise<void> {
		// Freeze follow relations with all remote users
		await this.followingsRepository
			.createQueryBuilder('following')
			.update({
				isFollowerHibernated: true,
			})
			.where({
				followeeId: user.id,
				followerHost: Not(IsNull()),
			})
			.execute();
	}

	@bindThis
	private async unFreezeAll(user: MiUser): Promise<void> {
		// Restore follow relations with all remote users

		// TypeORM does not support UPDATE with JOIN: https://github.com/typeorm/typeorm/issues/564#issuecomment-310331468
		await this.db.query(`
			UPDATE "following"
				SET "isFollowerHibernated" = false
			FROM "user"
			WHERE "user"."id" = "following"."followerId"
				AND "user"."isHibernated" = false -- Don't unfreeze if the follower is *actually* frozen
				AND "followeeId" = $1
				AND "followeeHost" IS NOT NULL
		`, [user.id]);
	}
}
