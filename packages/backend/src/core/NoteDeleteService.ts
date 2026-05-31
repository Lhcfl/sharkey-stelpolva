/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import type { MiUser, MiLocalUser, MiRemoteUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import type {
	InstancesRepository,
	MiMeta,
	NotesRepository,
	UsersRepository,
} from '@/models/_.js';
import type { IActivity } from '@/core/activitypub/type.js';
import { RelayService } from '@/core/RelayService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import NotesChart from '@/core/chart/charts/notes.js';
import PerUserNotesChart from '@/core/chart/charts/per-user-notes.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { isPureRenote } from '@/misc/is-renote.js';
import { isRemoteUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';
import { IsOne } from '@/misc/is-one.js';
import { SearchService } from '@/core/SearchService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { LatestNoteService } from '@/core/LatestNoteService.js';
import { ApLogService } from '@/core/ApLogService.js';
import { TimeService } from '@/global/TimeService.js';
import { CollapsedQueueService } from '@/core/CollapsedQueueService.js';
import { IdService } from '@/core/IdService.js';
import { Deduplicator } from '@/misc/deduplicator.js';
import { CountingSet } from '@/misc/CountingSet.js';
import { CacheService } from '@/core/CacheService.js';

@Injectable()
export class NoteDeleteService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		private idService: IdService,
		private globalEventService: GlobalEventService,
		private relayService: RelayService,
		private federatedInstanceService: FederatedInstanceService,
		private apRendererService: ApRendererService,
		private apDeliverManagerService: ApDeliverManagerService,
		private searchService: SearchService,
		private moderationLogService: ModerationLogService,
		private notesChart: NotesChart,
		private perUserNotesChart: PerUserNotesChart,
		private instanceChart: InstanceChart,
		private latestNoteService: LatestNoteService,
		private readonly apLogService: ApLogService,
		private readonly timeService: TimeService,
		private readonly collapsedQueueService: CollapsedQueueService,
		private readonly cacheService: CacheService,
	) {}

	/**
	 * 投稿を削除します。
	 */
	async delete(user: MiUser, note: MiNote, deleter?: MiUser, immediate = false, opts = { makePrivate: false }): Promise<void> {
		if (note.userId !== user.id) {
			throw new Error(`Not deleting note ${note.id} because user ${user.id} is not the expected author ${note.userId}. This is likely a bug; please report this error to Sharkey team.`);
		}

		// This kicks off lots of things that can run in parallel, but we should still wait for completion to ensure consistent state and to avoid task flood when calling in a loop.
		const promises: Promise<unknown>[] = [];

		const deletedAt = this.timeService.date;
		const cascadingNotes = await this.findCascadingNotes(note);
		const allNotes = [note, ...cascadingNotes];

		const noteDeduplicator = new Deduplicator<MiNote>(
			async id => await this.notesRepository.findOneByOrFail({ id }),
			allNotes.map(note => [note.id, note]),
		);

		// Increment updateNoteQueue
		for (const note of allNotes) {
			if (note.replyId) {
				this.collapsedQueueService.updateNoteQueue.enqueue(note.replyId, { repliesCountDelta: -1 });
			} else if (isPureRenote(note)) {
				this.collapsedQueueService.updateNoteQueue.enqueue(note.renoteId, { renoteCountDelta: -1 });
			}
		}

		// Braces preserved to avoid merge conflicts
		{
			// Publish websocket deleted events
			const publishKind = opts.makePrivate ? 'madePrivate' : 'deleted';
			for (const note of allNotes) {
				promises.push(this.globalEventService.publishNoteStream(note.id, publishKind, {
					id: note.id,
					userId: note.userId,
					body: {
						deletedAt: deletedAt,
					},
				}));
			}

			// Federate Delete(Note) or Undo(Announce(Note)) activities
			//#region ローカルの投稿なら削除アクティビティを配送
			for (const note of allNotes) {
				if (note.userHost == null && !note.localOnly) {
					const apUser = { id: note.userId, host: null };

					if (isPureRenote(note)) {
						promises.push(noteDeduplicator.fetch(note.renoteId).then(async renote => {
							const content = this.apRendererService.addContext(this.apRendererService.renderUndo(this.apRendererService.renderAnnounce(renote.uri ?? `${this.config.url}/notes/${renote.id}`, note), apUser));
							await this.deliverToConcerned(apUser, note, content);
						}));
					} else {
						const content = this.apRendererService.addContext(this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${note.id}`), apUser));
						promises.push(this.deliverToConcerned(apUser, note, content));
					}
				}
			}
			//#endregion

			// Update charts
			for (const note of allNotes) {
				this.notesChart.update(note, false);
				if (this.meta.enableChartsForRemoteUser || (note.userHost == null)) {
					this.perUserNotesChart.update({ id: note.userId }, note, false);
				}
			}

			// Increment updateUserQueue.
			// Don't mark cascaded user as updated (active)!
			this.collapsedQueueService.updateUserQueue.enqueue(user.id, { updatedAt: this.timeService.date });

			for (const note of allNotes) {
				if (!isPureRenote(note)) {
					this.collapsedQueueService.updateUserQueue.enqueue(note.userId, { notesCountDelta: -1 });
				}
			}

			// Update instance stats and queue
			if (this.meta.enableStatsForFederatedInstances) {
				for (const note of allNotes) {
					if (note.userHost != null) {
						if (!isPureRenote(note)) {
							this.collapsedQueueService.updateInstanceQueue.enqueue(note.userHost, { notesCountDelta: -1 });
						}
						if (this.meta.enableChartsForFederatedInstances) {
							this.instanceChart.updateNote(note.userHost, note, false);
						}
					}
				}
			}
		}

		// Increment updateChannelQueue
		promises.push(this.updateChannelCounts(allNotes));

		// Remove from search index
		for (const note of allNotes) {
			promises.push(this.searchService.unindexNote(note));
		}

		// Actually delete the notes, in reverse order (newest-to-oldest) to minimize load.
		// Don't put this in the promise array, since it needs to happen before the next section!
		const sortedNotes = allNotes.toSorted((a, b) => b.id.localeCompare(a.id));
		for (const note of sortedNotes) {
			if (opts.makePrivate) {
				await this.notesRepository.update({ id: note.id }, { visibility: 'specified' });
			} else {
				await this.notesRepository.delete({ id: note.id });
			}
		}

		// Update the Latest Note index / following feed *after* note is deleted
		for (const note of allNotes) {
			promises.push(immediate
				? this.latestNoteService.handleDeletedNote(note)
				: this.latestNoteService.handleDeletedNoteDeferred(note));
		}

		// Write mod log
		if (deleter && (user.id !== deleter.id)) {
			const kind = opts.makePrivate ? 'makePrivateNote' : 'deleteNote';
			promises.push(this.moderationLogService.log(deleter, kind, {
				noteId: note.id,
				noteUserId: note.userId,
				noteUserUsername: user.username,
				noteUserHost: user.host,
			}));
		}

		// Delete AP logs
		const deletedUris = allNotes
			.map(n => n.uri)
			.filter((u): u is string => u != null);
		if (deletedUris.length > 0) {
			promises.push(immediate
				? this.apLogService.deleteObjectLogs(deletedUris)
				: this.apLogService.deleteObjectLogsDeferred(deletedUris));
		}

		await Promise.allSettled(promises);
	}

	/**
	 * 投稿をmake privateします。
	 * @param user 投稿者
	 * @param note 投稿
	 */
	async makePrivate(user: MiUser, note: MiNote, deleter?: MiUser) {
		await this.delete(user, note, deleter, false, { makePrivate: true });
	}

	async makePrivateMany(user: MiUser, sinceDate: number, untilDate: number, countOnly = false) {
		const untilId = this.idService.gen(untilDate);
		const sinceId = this.idService.gen(sinceDate);
		const query = this.notesRepository.createQueryBuilder()
			.where('"userId" = :userId', { userId: user.id })
			.andWhere('NOT visibility = \'specified\'')
			.andWhere('id < :untilId', { untilId })
			.andWhere('id > :sinceId', { sinceId });

		if (countOnly) {
			return query.getCount();
		} else {
			if (await query.getCount() > 1500) {
				throw new Error('too many notes, the max is 1500');
			}
			const shouldMakePrivateNotes = await query.getMany();
			for (const note of shouldMakePrivateNotes) {
				await this.makePrivate(user, note);
				await new Promise(resolve => setTimeout(resolve, 500)); // wait for a while to avoid flooding the database
			}
			return shouldMakePrivateNotes.length;
		}
	}

	@bindThis
	private async findCascadingNotes(note: MiNote): Promise<MiNote[]> {
		const cascadingNotes = new Map<string, MiNote>();

		/**
		 * Finds all replies, quotes, and renotes of the given list of notes.
		 * These are the notes that will be CASCADE deleted when the origin note is deleted.
		 *
		 * This works by operating in "layers" that radiate out from the origin note like a web.
		 * The process is roughly like this:
		 *   1. Find all immediate replies and renotes of the origin.
		 *   2. Find all immediate replies and renotes of the results from step one.
		 *   3. Repeat until step 2 returns no new results.
		 *   4. Collect all the step 2 results; those are the set of all cascading notes.
		 */
		const cascade = async (layer: string[]): Promise<void> => {
			const refs = await this.notesRepository.find({
				where: [
					{ replyId: IsOne(layer) },
					{ renoteId: IsOne(layer) },
				],
			});

			const nextLayer: string[] = [];

			// Workaround for renote loop bug
			for (const note of refs) {
				if (!cascadingNotes.has(note.id)) {
					cascadingNotes.set(note.id, note);
					nextLayer.push(note.id);
				}
			}

			// Stop when we reach the end of all threads
			if (nextLayer.length < 1) return;

			await cascade(nextLayer);
		};

		// Start with the origin, which should *not* be in the result set!
		await cascade([note.id]);

		return cascadingNotes.values().toArray();
	}

	@bindThis
	private async getMentionedRemoteUsers(note: MiNote): Promise<MiRemoteUser[]> {
		const userIds = [...note.mentions, note.replyUserId, note.renoteUserId].filter(n => n != null);
		const users = await this.cacheService.findUsersById(userIds);
		const remoteUsers = users.values().filter(user => isRemoteUser(user));
		return remoteUsers.toArray();
	}

	@bindThis
	private async deliverToConcerned(user: { id: MiLocalUser['id']; host: null; }, note: MiNote, content: IActivity): Promise<void> {
		await this.apDeliverManagerService.deliverToFollowers(user, content);
		await this.apDeliverManagerService.deliverToUsers(user, content, await this.getMentionedRemoteUsers(note));
		await this.relayService.deliverToRelays(user, content);
	}

	@bindThis
	private async updateChannelCounts(allNotes: MiNote[]): Promise<void> {
		const channelNotesInBatch = allNotes.filter(n => n.channelId != null) as (MiNote & { channelId: string })[];
		if (channelNotesInBatch.length < 1) return;

		// Group batch by channelId => userId => noteCount
		const channelsInBatch = new Set(channelNotesInBatch.map(n => n.channelId));
		const usersInBatch = new Set(channelNotesInBatch.map(n => n.userId));
		const channelUserNoteCountsBatch = new Map<string, CountingSet<string>>();
		for (const note of channelNotesInBatch) {
			let userNoteCounts = channelUserNoteCountsBatch.get(note.channelId);
			if (!userNoteCounts) {
				userNoteCounts = new CountingSet();
				channelUserNoteCountsBatch.set(note.channelId, userNoteCounts);
			}
			userNoteCounts.add(note.userId);
		}

		const dbCounts = await this.notesRepository
			.createQueryBuilder('note')
			.select('note.channelId', 'channelId')
			.addSelect('note.userId', 'userId')
			.addSelect('count(note.id)', 'noteCount')
			.where({
				userId: IsOne(usersInBatch),
				channelId: IsOne(channelsInBatch),
			})
			.groupBy('note.channelId')
			.addGroupBy('note.userId')
			.getRawMany<{ channelId: string, userId: string, noteCount: number }>();

		// Organize bulk-data from DB
		const channelUserNoteCountsDb = new Map<string, CountingSet<string>>();
		for (const dbCount of dbCounts) {
			let userNoteCounts = channelUserNoteCountsDb.get(dbCount.channelId);
			if (!userNoteCounts) {
				userNoteCounts = new CountingSet();
				channelUserNoteCountsDb.set(dbCount.channelId, userNoteCounts);
			}
			userNoteCounts.add(dbCount.userId, dbCount.noteCount);
		}

		// Loop and update each channel
		for (const channel of channelsInBatch) {
			const noteUserCountsFromBatch = channelUserNoteCountsBatch.get(channel);
			const noteUserCountsFromDb = channelUserNoteCountsDb.get(channel);

			// Safety check; should never happen
			if (!noteUserCountsFromBatch || !noteUserCountsFromDb) continue;

			// Find number of notes being removed from this channel.
			const notesRemovingFromChannel = noteUserCountsFromBatch.count();
			const notesCountDelta = notesRemovingFromChannel > 0
				? (0 - notesRemovingFromChannel)
				: undefined;

			// Find number of users being removed from this channel.
			// (users are removed when all of their notes are removed)
			const usersRemovingFromChannel = noteUserCountsFromBatch.entries().filter(entry => entry[1] >= noteUserCountsFromDb.count(entry[0])).map(entry => entry[0]).toArray().length;
			const usersCountDelta = usersRemovingFromChannel > 0
				? (0 - usersRemovingFromChannel)
				: undefined;

			// Queue it for bulk-update later
			this.collapsedQueueService.updateChannelQueue.enqueue(channel, { notesCountDelta, usersCountDelta });
		}
	}
}
