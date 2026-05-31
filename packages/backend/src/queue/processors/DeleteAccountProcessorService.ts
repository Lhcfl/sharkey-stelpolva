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
import type { Queues, DbDeleteAccountJobData } from '@/queue/types.js';
import { EmailService } from '@/core/EmailService.js';
import { isLocalUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';
import { SearchService } from '@/core/SearchService.js';
import { ApLogService } from '@/core/ApLogService.js';
import { ReactionService } from '@/core/ReactionService.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { QueueLoggerService } from '@/queue/QueueLoggerService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import type * as Bull from 'bullmq';

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

		@Inject('queue:scheduleNotePost')
		private readonly scheduleNotePostQueue: Queues['scheduleNotePost'],

		private driveService: DriveService,
		private emailService: EmailService,
		private queueLoggerService: QueueLoggerService,
		private searchService: SearchService,
		private reactionService: ReactionService,
		private readonly apLogService: ApLogService,
		private readonly noteDeleteService: NoteDeleteService,
		private readonly apRendererService: ApRendererService,
		private readonly userEntityService: UserEntityService,
		private readonly apDeliverManagerService: ApDeliverManagerService,
		private readonly internalEventService: InternalEventService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('delete-account');
	}

	@bindThis
	public async process(job: Bull.Job<DbDeleteAccountJobData>): Promise<string> {
		this.logger.info(`Deleting account of ${job.data.user.id} ...`);

		const user = await this.usersRepository.findOneBy({ id: job.data.user.id });
		if (user == null) {
			return 'skip - user not found';
		}

		{ // Federate delete
			if (isLocalUser(user)) {
				// Federate Delete(Person) activities
				const activity = this.apRendererService.addContext(this.apRendererService.renderDelete(this.userEntityService.genLocalUserUri(user.id), user));

				const dm = this.apDeliverManagerService.createDeliverManager(user, activity);
				dm.addNetworkRecipe(); // Send to sharedInbox of known network.
				dm.addFollowersRecipe(); // Additionally send to regular inbox of followers who lack a sharedInbox.
				await dm.execute();

				this.logger.info('Delete(Person) activities have been queued.');
			} else {
				this.logger.debug('Not sending activities for remote user');
			}
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
				await this.scheduleNotePostQueue.remove(`schedNote_${note.id}`);
				// this is for notes scheduled with 2025.4 or earlier
				await this.scheduleNotePostQueue.remove(`schedNote:${note.id}`).catch(() => null);
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
				await this.usersRepository.update({ id: user.id }, {
					followersCount: 0,
					followingCount: 0,
					notesCount: 0,
					avatarId: null,
					avatarUrl: null,
					avatarBlurhash: null,
					bannerId: null,
					bannerUrl: null,
					bannerBlurhash: null,
					backgroundId: null,
					backgroundUrl: null,
					backgroundBlurhash: null,
					avatarDecorations: [],
					tags: [],
					emojis: [],
					score: 0, // WTF is this?
					noindex: true,
					isLocked: true,
					isExplorable: false,
					requireSigninToViewContents: true,
					makeNotesFollowersOnlyBefore: null,
					makeNotesHiddenBefore: null,
					chatScope: 'none',
					featured: null,
					followersUri: null,
					enableRss: false,
					allowUnsignedFetch: 'never',
				});
				await this.internalEventService.emit('userUpdated', { id: user.id });
				await this.userProfilesRepository.update({ userId: user.id }, {
					location: null,
					birthday: null,
					listenbrainz: null,
					description: null,
					followedMessage: null,
					fields: [],
					lang: null,
					publicReactions: false,
					followersVisibility: 'private',
					followingVisibility: 'private',
					clientData: {},
					room: {}, // TODO isn't this obsolete?
					autoAcceptFollowed: false,
					noCrawle: true,
					preventAiLearning: true,
					defaultSensitive: true,
					autoSensitive: false,
					pinnedPageId: null,
					mutedWords: [],
					hardMutedWords: [],
					mutedInstances: [],
					notificationRecieveConfig: {},
					defaultCW: null,
				});
				await this.internalEventService.emit('updateUserProfile', { userId: user.id, keys: null });
			} else {
				await this.usersRepository.delete({ id: user.id });
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
