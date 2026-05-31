/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { FollowingsRepository, UsersRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { isLocalUser } from '@/models/User.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { CollapsedQueueService } from '@/core/CollapsedQueueService.js';
import { TimeService } from '@/global/TimeService.js';

export type ActivityLevel = 'idle' | 'read' | 'write';

@Injectable()
export class UserService {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,
		private systemWebhookService: SystemWebhookService,
		private userEntityService: UserEntityService,
		private readonly collapsedQueueService: CollapsedQueueService,
		private readonly timeService: TimeService,
		private readonly activeUsersChart: ActiveUsersChart,
	) {
	}

	/**
	 * Marks as user as active at the specified activity level.
	 * @param user User to mark active
	 * @param activityLevel Activity type level, defaults to "read" for backwards-compatibility.
	 * @param now Optional timestamp to override the value of "now".
	 */
	public markUserActive(user: MiUser, activityLevel?: ActivityLevel, now?: Date): void;
	/**
	 * Marks as user as active at "read" or "write" level.
	 * @deprecated Use the ActivityType overload instead.
	 * @param user User to mark active
	 * @param isWrite If true, this is "write" level. If false or undefined, then "read" level.
	 */
	public markUserActive(user: MiUser, isWrite?: boolean): void;
	@bindThis
	public markUserActive(user: MiUser, activityLevelOrIsWrite: ActivityLevel | boolean = 'read', now?: Date): void {
		const activityType = typeof(activityLevelOrIsWrite) === 'boolean'
			? activityLevelOrIsWrite
				? 'write'
				: 'read'
			: activityLevelOrIsWrite;

		const isWrite = activityType === 'write';
		const isRead = isWrite || activityType === 'read';

		now ??= this.timeService.date;
		this.collapsedQueueService.updateUserQueue.enqueue(user.id, {
			// All actions tick lastActiveDate
			lastActiveDate: now,

			// Write (active) actions tick updatedAt
			updatedAt: isWrite ? now : undefined,
		});

		// Local actions tick activeUsersChart
		if (isLocalUser(user)) {
			if (isWrite) {
				this.activeUsersChart.write(user);
			} else if (isRead) {
				this.activeUsersChart.read(user);
			}
		}
	}

	/**
	 * SystemWebhookを用いてユーザに関する操作内容を管理者各位に通知する.
	 * ここではJobQueueへのエンキューのみを行うため、即時実行されない.
	 *
	 * @see SystemWebhookService.enqueueSystemWebhook
	 */
	@bindThis
	public async notifySystemWebhook(user: MiUser, type: 'userCreated') {
		const packedUser = await this.userEntityService.pack(user, null, { schema: 'UserLite' });
		return await this.systemWebhookService.enqueueSystemWebhook(type, packedUser);
	}
}
