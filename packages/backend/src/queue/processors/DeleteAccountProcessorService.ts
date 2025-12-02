/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In, IsNull, MoreThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository, NoteReactionsRepository, NotesRepository, UserProfilesRepository, UsersRepository, NoteScheduleRepository, MiNoteSchedule, FollowingsRepository, FollowRequestsRepository, BlockingsRepository, MutingsRepository, ClipsRepository, ClipNotesRepository, LatestNotesRepository, NoteEditsRepository, NoteFavoritesRepository, PollVotesRepository, PollsRepository, SigninsRepository, UserIpsRepository, RegistryItemsRepository, MiUser } from '@/models/_.js';
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
import { QueueService } from '@/core/QueueService.js';
import { CacheService } from '@/core/CacheService.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { QueueLoggerService } from '@/queue/QueueLoggerService.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import * as Acct from '@/misc/acct.js';
import type * as Bull from 'bullmq';
import type { DbUserDeleteJobData } from '../types.js';

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

		@Inject(DI.followingsRepository)
		private readonly followingsRepository: FollowingsRepository,

		@Inject(DI.followRequestsRepository)
		private readonly followRequestsRepository: FollowRequestsRepository,

		@Inject(DI.blockingsRepository)
		private readonly blockingsRepository: BlockingsRepository,

		@Inject(DI.mutingsRepository)
		private readonly mutingsRepository: MutingsRepository,

		@Inject(DI.clipsRepository)
		private readonly clipsRepository: ClipsRepository,

		@Inject(DI.clipNotesRepository)
		private readonly clipNotesRepository: ClipNotesRepository,

		@Inject(DI.latestNotesRepository)
		private readonly latestNotesRepository: LatestNotesRepository,

		@Inject(DI.noteEditsRepository)
		private readonly noteEditsRepository: NoteEditsRepository,

		@Inject(DI.noteFavoritesRepository)
		private readonly noteFavoritesRepository: NoteFavoritesRepository,

		@Inject(DI.pollVotesRepository)
		private readonly pollVotesRepository: PollVotesRepository,

		@Inject(DI.pollsRepository)
		private readonly pollsRepository: PollsRepository,

		@Inject(DI.signinsRepository)
		private readonly signinsRepository: SigninsRepository,

		@Inject(DI.userIpsRepository)
		private readonly userIpsRepository: UserIpsRepository,

		@Inject(DI.registryItemsRepository)
		private readonly registryItemsRepository: RegistryItemsRepository,

		private queueService: QueueService,
		private driveService: DriveService,
		private emailService: EmailService,
		private queueLoggerService: QueueLoggerService,
		private searchService: SearchService,
		private reactionService: ReactionService,
		private readonly apLogService: ApLogService,
		private readonly cacheService: CacheService,
		private readonly apPersonService: ApPersonService,
		private readonly noteDeleteService: NoteDeleteService,
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

		{ // Delete user clips
			const userClips = await this.clipsRepository.find({
				select: {
					id: true,
				},
				where: {
					userId: user.id,
				},
			}) as { id: string }[];

			// Delete one-at-a-time because there can be a lot
			for (const clip of userClips) {
				await this.clipNotesRepository.delete({
					id: clip.id,
				});
			}

			await this.clipsRepository.delete({
				userId: user.id,
			});

			this.logger.info('All clips have been deleted.');
		}

		{ // Delete favorites
			await this.noteFavoritesRepository.delete({
				userId: user.id,
			});

			this.logger.info('All favorites have been deleted.');
		}

		{ // Delete user relations
			await this.cacheService.refreshFollowRelationsFor(user.id);
			await this.cacheService.userFollowingsCache.delete(user.id);
			await this.cacheService.userFollowingsCache.delete(user.id);
			await this.cacheService.userBlockingCache.delete(user.id);
			await this.cacheService.userBlockedCache.delete(user.id);
			await this.cacheService.userMutingsCache.delete(user.id);
			await this.cacheService.userMutingsCache.delete(user.id);
			await this.cacheService.hibernatedUserCache.delete(user.id);
			await this.cacheService.renoteMutingsCache.delete(user.id);
			await this.cacheService.userProfileCache.delete(user.id);
			await this.cacheService.userByIdCache.delete(user.id);
			await this.cacheService.userByAcctCache.delete(Acct.toString({ username: user.usernameLower, host: user.host }));
			await this.cacheService.userFollowStatsCache.delete(user.id);
			if (user.token) {
				await this.cacheService.nativeTokenCache.delete(user.token);
			}
			if (user.uri) {
				await this.apPersonService.uriPersonCache.delete(user.uri);
			}

			await this.followingsRepository.delete({
				followerId: user.id,
			});

			await this.followingsRepository.delete({
				followeeId: user.id,
			});

			await this.followRequestsRepository.delete({
				followerId: user.id,
			});

			await this.followRequestsRepository.delete({
				followeeId: user.id,
			});

			await this.blockingsRepository.delete({
				blockerId: user.id,
			});

			await this.blockingsRepository.delete({
				blockeeId: user.id,
			});

			await this.mutingsRepository.delete({
				muterId: user.id,
			});

			await this.mutingsRepository.delete({
				muteeId: user.id,
			});

			this.logger.info('All user relations have been deleted.');
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
					relations: {
						note: true,
					},
				}) as MiNoteReaction[];

				if (reactions.length === 0) {
					break;
				}

				cursor = reactions.at(-1)?.id ?? null;

				for (const reaction of reactions) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const note = reaction.note!;
					await this.reactionService.delete(user, note, reaction);
				}
			}

			this.logger.info('All reactions have been deleted');
		}

		{ // Poll votes
			let cursor: MiNoteReaction['id'] | null = null;

			while (true) {
				const votes = await this.pollVotesRepository.find({
					where: {
						userId: user.id,
						...(cursor ? { id: MoreThan(cursor) } : {}),
					},
					select: {
						id: true,
					},
					take: 100,
					order: {
						id: 1,
					},
				}) as { id: string }[];

				if (votes.length === 0) {
					break;
				}

				cursor = votes.at(-1)?.id ?? null;

				await this.pollVotesRepository.delete({
					id: In(votes.map(v => v.id)),
				});
			}

			this.logger.info('All poll votes have been deleted');
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

			this.logger.info('All scheduled notes deleted');
		}

		{ // Delete notes
			await this.latestNotesRepository.delete({
				userId: user.id,
			});

			let cursor: MiNote['id'] | null = null;

			while (true) {
				const notes = await this.notesRepository.find({
					where: {
						userId: user.id,
						replyId: IsNull(),
						...(cursor ? { id: MoreThan(cursor) } : {}),
					},
					take: 100,
					order: {
						id: 'desc',
					},
				}) as MiNote[];

				if (notes.length === 0) {
					break;
				}

				cursor = notes.at(-1)?.id ?? null;

				// Delete associated polls one-at-a-time, since it can cascade to a LOT of vote entries
				for (const note of notes) {
					if (note.hasPoll) {
						await this.pollsRepository.delete({
							noteId: note.id,
						});
					}
				}

				const ids = notes.map(note => note.id);

				const replies = await this.notesRepository.find({
					where: { replyId: In(ids) },
					relations: { user: true },
				});

				// Delete replies through the usual service to ensure we get all "cascading notes" logic.
				for (const reply of replies) {
					await this.noteDeleteService.delete(reply.user as MiUser, reply, undefined, true);
				}

				await this.noteEditsRepository.delete({
					noteId: In(ids),
				});
				await this.notesRepository.delete({
					id: In(ids),
				});

				for (const note of notes) {
					await this.searchService.unindexNote(note);
				}

				// Delete note AP logs
				const noteUris = notes.map(n => n.uri).filter(u => !!u) as string[];
				if (noteUris.length > 0) {
					await this.apLogService.deleteObjectLogs(noteUris);
				}
			}

			this.logger.info('All of notes deleted');
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

			this.logger.info('All of files deleted');
		}

		{ // Delete actor logs
			if (user.uri) {
				await this.apLogService.deleteObjectLogs(user.uri);
			}

			await this.apLogService.deleteInboxLogs(user.id);

			this.logger.info('All AP logs deleted');
		}

		// Do this BEFORE deleting the account!
		const profile = await this.userProfilesRepository.findOneBy({ userId: user.id });

		{ // Delete the actual account
			await this.userIpsRepository.delete({
				userId: user.id,
			});

			await this.signinsRepository.delete({
				userId: user.id,
			});

			await this.registryItemsRepository.delete({
				userId: user.id,
			});

			// soft指定されている場合は物理削除しない
			if (job.data.soft) {
				// nop
			} else {
				await this.usersRepository.delete(user.id);
			}

			this.logger.info('Account data deleted');
		}

		{ // Send email notification
			if (profile && profile.email && profile.emailVerified) {
				try {
					await this.emailService.sendEmail(profile.email, 'Account deleted',
						'Your account has been deleted.',
						'Your account has been deleted.');
				} catch (e) {
					this.logger.warn('Failed to send account deletion message:', { e });
				}
			}
		}

		return 'Account deleted';
	}
}
