/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { FollowingsRepository, UsersRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { CollapsedQueueService } from '@/core/CollapsedQueueService.js';
import { TimeService } from '@/global/TimeService.js';

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
	) {
	}

	@bindThis
	public async updateLastActiveDate(user: MiUser): Promise<void> {
		await this.collapsedQueueService.updateUserQueue.enqueue(user.id, { lastActiveDate: this.timeService.date });
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
