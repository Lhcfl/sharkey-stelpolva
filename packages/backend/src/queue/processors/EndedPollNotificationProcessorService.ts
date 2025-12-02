/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { PollVotesRepository, NotesRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { CacheService } from '@/core/CacheService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { EndedPollNotificationJobData } from '../types.js';

@Injectable()
export class EndedPollNotificationProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.pollVotesRepository)
		private pollVotesRepository: PollVotesRepository,

		private cacheService: CacheService,
		private notificationService: NotificationService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('ended-poll-notification');
	}

	@bindThis
	public async process(job: Bull.Job<EndedPollNotificationJobData>): Promise<void> {
		const note = await this.notesRepository.findOneBy({ id: job.data.noteId });
		if (note == null || !note.hasPoll) {
			return;
		}

		const votes = await this.pollVotesRepository.createQueryBuilder('vote')
			.select('vote.userId')
			.groupBy('vote.userId')
			.where('vote.noteId = :noteId', { noteId: note.id })
			.getRawMany() as { vote_userId: string }[];

		const userIds = new Set(votes.map(v => v.vote_userId));
		userIds.add(note.id);

		const users = await this.cacheService.findUsersById(userIds);

		for (const user of users.values()) {
			if (user.host == null) {
				this.notificationService.createNotification(user.id, 'pollEnded', {
					noteId: note.id,
				});
			}
		}
	}
}
