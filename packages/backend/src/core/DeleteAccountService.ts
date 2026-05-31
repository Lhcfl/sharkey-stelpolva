/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta, MiUser, UsersRepository } from '@/models/_.js';
import { QueueService } from '@/core/QueueService.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { isSystemAccount } from '@/misc/is-system-account.js';
import { isRemoteUser } from '@/models/User.js';
import { IdentifiableError, errorCodes } from '@/misc/identifiable-error.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { TimeService } from '@/global/TimeService.js';
import type { Job } from 'bullmq';

@Injectable()
export class DeleteAccountService {
	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private queueService: QueueService,
		private moderationLogService: ModerationLogService,
		private readonly internalEventService: InternalEventService,
		private readonly timeService: TimeService,
	) {
	}

	@bindThis
	public async deleteAccount(user: MiUser, moderator?: MiUser): Promise<Job> {
		if (this.meta.rootUserId === user.id) {
			throw new IdentifiableError(errorCodes.userProtected, 'Cannot delete the root account');
		}

		if (isSystemAccount(user)) {
			throw new IdentifiableError(errorCodes.userProtected, 'Cannot delete a system account');
		}

		if (moderator != null) {
			await this.moderationLogService.log(moderator, 'deleteAccount', {
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
			});
		}

		// 1. Update database
		await this.usersRepository.update({ id: user.id }, {
			isDeleted: true,
			deletedAt: this.timeService.date,
		});

		// 2. Sync to other processes
		await this.internalEventService.emit('userUpdated', { id: user.id });
		await this.internalEventService.emit('userChangeDeletedState', { id: user.id, isDeleted: true, token: user.token, uri: user.uri, usernameLower: user.username.toLowerCase(), host: user.host });

		// 3. *then* finally start the background job
		return await this.queueService.createDeleteAccountJob(user, {
			// soft-delete remote users, otherwise they may get re-created by federation.
			soft: isRemoteUser(user),
		});
	}
}
