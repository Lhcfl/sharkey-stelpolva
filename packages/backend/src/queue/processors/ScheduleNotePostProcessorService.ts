/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import type { ChannelsRepository, DriveFilesRepository, MiDriveFile, NoteScheduleRepository, NotesRepository, UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { NotificationService } from '@/core/NotificationService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import type { MiScheduleNoteType } from '@/models/NoteSchedule.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { TimeService } from '@/global/TimeService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { ScheduleNotePostJobData } from '../types.js';

@Injectable()
export class ScheduleNotePostProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.noteScheduleRepository)
		private noteScheduleRepository: NoteScheduleRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,
		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		private noteCreateService: NoteCreateService,
		private queueLoggerService: QueueLoggerService,
		private notificationService: NotificationService,
		private readonly timeService: TimeService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('schedule-note-post');
	}

	@bindThis
	private async isValidNoteSchedule(note: MiScheduleNoteType, id: string): Promise<boolean> {
		const reply = note.reply ? await this.notesRepository.findOneBy({ id: note.reply }) : undefined;
		const renote = note.renote ? await this.notesRepository.findOneBy({ id: note.renote }) : undefined;
		const channel = note.channel ? await this.channelsRepository.findOneBy({ id: note.channel, isArchived: false }) : undefined;
		if (note.reply && !reply) {
			this.logger.warn('Schedule Note Failed Reason: parent note to reply does not exist');
			this.notificationService.createNotification(id, 'scheduledNoteFailed', {
				reason: 'Replied to note on your scheduled note no longer exists',
			});
			return false;
		}
		if (note.renote && !renote) {
			this.logger.warn('Schedule Note Failed Reason: attached quote note no longer exists');
			this.notificationService.createNotification(id, 'scheduledNoteFailed', {
				reason: 'A quoted note from one of your scheduled notes no longer exists',
			});
			return false;
		}
		if (note.channel && !channel) {
			this.logger.warn('Schedule Note Failed Reason: Channel does not exist');
			this.notificationService.createNotification(id, 'scheduledNoteFailed', {
				reason: 'An attached channel on your scheduled note no longer exists',
			});
			return false;
		}
		return true;
	}

	@bindThis
	public async process(job: Bull.Job<ScheduleNotePostJobData>): Promise<void> {
		this.noteScheduleRepository.findOneBy({ id: job.data.scheduleNoteId }).then(async (data) => {
			if (!data) {
				this.logger.warn(`Schedule note ${job.data.scheduleNoteId} not found`);
			} else {
				const me = await this.usersRepository.findOneBy({ id: data.userId });
				const note = data.note;
				const reply = note.reply ? await this.notesRepository.findOneBy({ id: note.reply }) : undefined;
				const renote = note.renote ? await this.notesRepository.findOneBy({ id: note.renote }) : undefined;
				const channel = note.channel ? await this.channelsRepository.findOneBy({ id: note.channel, isArchived: false }) : undefined;

				let files: MiDriveFile[] = [];
				const fileIds = note.files;

				if (fileIds.length > 0 && me) {
					files = await this.driveFilesRepository.createQueryBuilder('file')
						.where('file.userId = :userId AND file.id IN (:...fileIds)', {
							userId: me.id,
							fileIds,
						})
						.orderBy('array_position(ARRAY[:...fileIds], "id"::text)')
						.setParameters({ fileIds })
						.getMany();
				}

				if (!data.userId || !me) {
					this.logger.warn('Schedule Note Failed Reason: User Not Found');
					await this.noteScheduleRepository.remove(data);
					return;
				}

				if (!await this.isValidNoteSchedule(note, me.id)) {
					await this.noteScheduleRepository.remove(data);
					return;
				}

				if (note.files.length !== files.length) {
					this.logger.warn('Schedule Note Failed Reason: files are missing in the user\'s drive');
					this.notificationService.createNotification(me.id, 'scheduledNoteFailed', {
						reason: 'Some attached files on your scheduled note no longer exist',
					});
					await this.noteScheduleRepository.remove(data);
					return;
				}

				const createdNote = await this.noteCreateService.create(me, {
					...note,
					createdAt: this.timeService.date,
					files,
					poll: note.poll ? {
						choices: note.poll.choices,
						multiple: note.poll.multiple,
						expiresAt: note.poll.expiresAt ? new Date(note.poll.expiresAt) : null,
					} : undefined,
					reply,
					renote,
					channel,
				}).catch(async (err: IdentifiableError) => {
					this.notificationService.createNotification(me.id, 'scheduledNoteFailed', {
						reason: renderInlineError(err),
					});
					await this.noteScheduleRepository.remove(data);
					this.logger.error(`Scheduled note failed: ${renderInlineError(err)}`);
					throw err;
				});
				await this.noteScheduleRepository.remove(data);
				this.notificationService.createNotification(me.id, 'scheduledNotePosted', {
					noteId: createdNote.id,
				});
			}
		});
	}
}
