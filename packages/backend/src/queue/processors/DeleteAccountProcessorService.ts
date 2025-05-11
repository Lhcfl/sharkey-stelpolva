/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { MoreThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository, NoteReactionsRepository, NotesRepository, UserProfilesRepository, UsersRepository, NoteScheduleRepository, MiNoteSchedule } from '@/models/_.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import type { MiNoteReaction } from '@/models/NoteReaction.js';
import { EmailService } from '@/core/EmailService.js';
import { bindThis } from '@/decorators.js';
import { SearchService } from '@/core/SearchService.js';
import { ApLogService } from '@/core/ApLogService.js';
import { ReactionService } from '@/core/ReactionService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { DbUserDeleteJobData } from '../types.js';
import { QueueService } from '@/core/QueueService.js';

@Injectable()
export class DeleteAccountProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.noteReactionsRepository)
		private noteReactionsRepository: NoteReactionsRepository,

		@Inject(DI.noteScheduleRepository)
		private noteScheduleRepository: NoteScheduleRepository,

		private queueService: QueueService,
		private driveService: DriveService,
		private emailService: EmailService,
		private queueLoggerService: QueueLoggerService,
		private searchService: SearchService,
		private reactionService: ReactionService,
		private readonly apLogService: ApLogService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('delete-account');
	}

	@bindThis
	public async process(job: Bull.Job<DbUserDeleteJobData>): Promise<string | void> {
		this.logger.info(`Deleting account of ${job.data.user.id} ...`);

		const user = await this.usersRepository.findOneBy({ id: job.data.user.id });
		if (user == null) {
			return;
		}

		{ // Delete scheduled notes
			const scheduledNotes = await this.noteScheduleRepository.findBy({
				userId: user.id,
			}) as MiNoteSchedule[];

			for (const note of scheduledNotes) {
				await this.queueService.ScheduleNotePostQueue.remove(`schedNote:${note.id}`);
			}

			await this.noteScheduleRepository.delete({
				userId: user.id,
			});

			this.logger.succ('All scheduled notes deleted');
		}

		{ // Delete notes
			let cursor: MiNote['id'] | null = null;

			while (true) {
				const notes = await this.notesRepository.find({
					where: {
						userId: user.id,
						...(cursor ? { id: MoreThan(cursor) } : {}),
					},
					take: 100,
					order: {
						id: 1,
					},
				}) as MiNote[];

				if (notes.length === 0) {
					break;
				}

				cursor = notes.at(-1)?.id ?? null;

				await this.notesRepository.delete(notes.map(note => note.id));

				for (const note of notes) {
					await this.searchService.unindexNote(note);
				}

				// Delete note AP logs
				const noteUris = notes.map(n => n.uri).filter(u => !!u) as string[];
				if (noteUris.length > 0) {
					await this.apLogService.deleteObjectLogs(noteUris)
						.catch(err => this.logger.error(err, `Failed to delete AP logs for notes of user '${user.uri ?? user.id}'`));
				}
			}

			this.logger.succ('All of notes deleted');
		}

		{ // Delete reactions
			let cursor: MiNoteReaction['id'] | null = null;

			while (true) {
				const reactions = await this.noteReactionsRepository.find({
					where: {
						userId: user.id,
						...(cursor ? { id: MoreThan(cursor) } : {}),
					},
					take: 100,
					order: {
						id: 1,
					},
				}) as MiNoteReaction[];

				if (reactions.length === 0) {
					break;
				}

				cursor = reactions.at(-1)?.id ?? null;

				for (const reaction of reactions) {
					const note = await this.notesRepository.findOneBy({ id: reaction.noteId }) as MiNote;

					await this.reactionService.delete(user, note);
				}
			}

			this.logger.succ('All reactions have been deleted');
		}

		{ // Delete files
			let cursor: MiDriveFile['id'] | null = null;

			while (true) {
				const files = await this.driveFilesRepository.find({
					where: {
						userId: user.id,
						...(cursor ? { id: MoreThan(cursor) } : {}),
					},
					take: 10,
					order: {
						id: 1,
					},
				}) as MiDriveFile[];

				if (files.length === 0) {
					break;
				}

				cursor = files.at(-1)?.id ?? null;

				for (const file of files) {
					await this.driveService.deleteFileSync(file);
				}
			}

			this.logger.succ('All of files deleted');
		}

		{ // Delete actor logs
			if (user.uri) {
				await this.apLogService.deleteObjectLogs(user.uri)
					.catch(err => this.logger.error(err, `Failed to delete AP logs for user '${user.uri}'`));
			}

			await this.apLogService.deleteInboxLogs(user.id)
				.catch(err => this.logger.error(err, `Failed to delete AP logs for user '${user.uri}'`));

			this.logger.succ('All AP logs deleted');
		}

		{ // Send email notification
			const profile = await this.userProfilesRepository.findOneByOrFail({ userId: user.id });
			if (profile.email && profile.emailVerified) {
				this.emailService.sendEmail(profile.email, 'Account deleted',
					'Your account has been deleted.',
					'Your account has been deleted.');
			}
		}

		// soft指定されている場合は物理削除しない
		if (job.data.soft) {
		// nop
		} else {
			await this.usersRepository.delete(job.data.user.id);
		}

		return 'Account deleted';
	}
}
