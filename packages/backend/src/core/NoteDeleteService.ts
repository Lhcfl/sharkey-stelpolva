/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets, In, IsNull, Not } from 'typeorm';
import { Injectable, Inject } from '@nestjs/common';
import type { MiUser, MiLocalUser, MiRemoteUser } from '@/models/User.js';
import { isLocalUser, isRemoteUser } from '@/models/User.js';
import { MiNote, IMentionedRemoteUsers } from '@/models/Note.js';
import type { InstancesRepository, MiMeta, NotesRepository, UsersRepository } from '@/models/_.js';
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
import { bindThis } from '@/decorators.js';
import { SearchService } from '@/core/SearchService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { isPureRenote } from '@/misc/is-renote.js';
import { LatestNoteService } from '@/core/LatestNoteService.js';
import { ApLogService } from '@/core/ApLogService.js';
import { TimeService } from '@/global/TimeService.js';
import { trackTask } from '@/misc/promise-tracker.js';
import { CollapsedQueueService } from '@/core/CollapsedQueueService.js';
import { IdService } from '@/core/IdService.js';

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
	) {}

	/**
	 * 投稿を削除します。
	 */
	async delete(user: MiUser, note: MiNote, deleter?: MiUser, immediate = false) {
		// This kicks off lots of things that can run in parallel, but we should still wait for completion to ensure consistent state and to avoid task flood when calling in a loop.
		const promises: Promise<unknown>[] = [];

		const deletedAt = this.timeService.date;
		const cascadingNotes = await this.findCascadingNotes(note);

		if (note.replyId) {
			await this.collapsedQueueService.updateNoteQueue.enqueue(note.replyId, { repliesCountDelta: -1 });
		} else if (isPureRenote(note)) {
			await this.collapsedQueueService.updateNoteQueue.enqueue(note.renoteId, { renoteCountDelta: -1 });
		}

		for (const cascade of cascadingNotes) {
			if (cascade.replyId) {
				await this.collapsedQueueService.updateNoteQueue.enqueue(cascade.replyId, { repliesCountDelta: -1 });
			} else if (isPureRenote(cascade)) {
				await this.collapsedQueueService.updateNoteQueue.enqueue(cascade.renoteId, { renoteCountDelta: -1 });
			}
		}

		// Braces preserved to avoid merge conflicts
		{
			promises.push(this.globalEventService.publishNoteStream(note.id, 'deleted', {
				deletedAt: deletedAt,
			}));

			for (const cascade of cascadingNotes) {
				promises.push(this.globalEventService.publishNoteStream(cascade.id, 'deleted', {
					deletedAt: deletedAt,
				}));
			}

			for (const cascadingNote of cascadingNotes) {
				this.globalEventService.publishNoteStream(cascadingNote.id, 'deleted', {
					deletedAt: deletedAt,
				});
			}

			//#region ローカルの投稿なら削除アクティビティを配送
			if (isLocalUser(user) && !note.localOnly) {
				const renote = isPureRenote(note)
					? await this.notesRepository.findOneBy({ id: note.renoteId })
					: null;

				const content = this.apRendererService.addContext(renote
					? this.apRendererService.renderUndo(this.apRendererService.renderAnnounce(renote.uri ?? `${this.config.url}/notes/${renote.id}`, note), user)
					: this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${note.id}`), user));

				promises.push(this.deliverToConcerned(user, note, content));
			}

			// also deliver delete activity to cascaded notes
			const federatedLocalCascadingNotes = (cascadingNotes).filter(note => !note.localOnly && note.userHost == null); // filter out local-only notes
			for (const cascadingNote of federatedLocalCascadingNotes) {
				if (!cascadingNote.user) continue;
				if (!isLocalUser(cascadingNote.user)) continue;
				const content = this.apRendererService.addContext(this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${cascadingNote.id}`), cascadingNote.user));
				promises.push(this.deliverToConcerned(cascadingNote.user, cascadingNote, content));
			}
			//#endregion

			this.notesChart.update(note, false);
			if (this.meta.enableChartsForRemoteUser || (user.host == null)) {
				this.perUserNotesChart.update(user, note, false);
			}

			for (const cascade of cascadingNotes) {
				this.notesChart.update(cascade, false);
				if (this.meta.enableChartsForRemoteUser || (cascade.user.host == null)) {
					this.perUserNotesChart.update(cascade.user, cascade, false);
				}
			}

			if (!isPureRenote(note)) {
				// Decrement notes count (user)
				await this.collapsedQueueService.updateUserQueue.enqueue(user.id, { notesCountDelta: -1 });
			}

			await this.collapsedQueueService.updateUserQueue.enqueue(user.id, { updatedAt: this.timeService.date });

			for (const cascade of cascadingNotes) {
				if (!isPureRenote(cascade)) {
					await this.collapsedQueueService.updateUserQueue.enqueue(cascade.user.id, { notesCountDelta: -1 });
				}
				// Don't mark cascaded user as updated (active)
			}

			if (this.meta.enableStatsForFederatedInstances) {
				if (isRemoteUser(user)) {
					if (!isPureRenote(note)) {
						const i = await this.federatedInstanceService.fetchOrRegister(user.host);
						await this.collapsedQueueService.updateInstanceQueue.enqueue(i.id, { notesCountDelta: -1 });
					}
					if (this.meta.enableChartsForFederatedInstances) {
						this.instanceChart.updateNote(user.host, note, false);
					}
				}

				for (const cascade of cascadingNotes) {
					if (isRemoteUser(cascade.user)) {
						if (!isPureRenote(cascade)) {
							const i = await this.federatedInstanceService.fetchOrRegister(cascade.user.host);
							await this.collapsedQueueService.updateInstanceQueue.enqueue(i.id, { notesCountDelta: -1 });
						}
						if (this.meta.enableChartsForFederatedInstances) {
							this.instanceChart.updateNote(cascade.user.host, cascade, false);
						}
					}
				}
			}
		}

		for (const cascadingNote of cascadingNotes) {
			promises.push(this.searchService.unindexNote(cascadingNote));
		}
		promises.push(this.searchService.unindexNote(note));

		// Don't put this in the promise array, since it needs to happen before the next section
		await this.notesRepository.delete({
			id: note.id,
			userId: user.id,
		});

		// Update the Latest Note index / following feed *after* note is deleted
		promises.push(immediate
			? this.latestNoteService.handleDeletedNote(note)
			: this.latestNoteService.handleDeletedNoteDeferred(note));
		for (const cascadingNote of cascadingNotes) {
			promises.push(immediate
				? this.latestNoteService.handleDeletedNote(cascadingNote)
				: this.latestNoteService.handleDeletedNoteDeferred(cascadingNote));
		}

		if (deleter && (user.id !== deleter.id)) {
			promises.push(this.moderationLogService.log(deleter, 'deleteNote', {
				noteId: note.id,
				noteUserId: note.userId,
				noteUserUsername: user.username,
				noteUserHost: user.host,
			}));
		}

		const deletedUris = [note, ...cascadingNotes]
			.map(n => n.uri)
			.filter((u): u is string => u != null);
		if (deletedUris.length > 0) {
			promises.push(immediate
				? this.apLogService.deleteObjectLogs(deletedUris)
				: this.apLogService.deleteObjectLogsDeferred(deletedUris));
		}

		await trackTask(async () => {
			await Promise.allSettled(promises);

			// This is deferred to make sure we don't race the enqueue() calls
			if (immediate) {
				await Promise.allSettled([
					this.collapsedQueueService.updateNoteQueue.performAllNow(),
					this.collapsedQueueService.updateUserQueue.performAllNow(),
					this.collapsedQueueService.updateInstanceQueue.performAllNow(),
				]);
			}
		});
	}

	/**
	 * 投稿をmake privateします。
	 * @param user 投稿者
	 * @param note 投稿
	 */
	async makePrivate(user: { id: MiUser['id']; uri: MiUser['uri']; host: MiUser['host']; isBot: MiUser['isBot']; }, note: MiNote, quiet = false, deleter?: MiUser) {
		if (isRemoteUser(user)) {
			// SKIP: should not make private for remote user
			return;
		}
		if (note.visibility === 'specified') {
			// SKIP: should not make private for already private note
			return;
		}
		const deletedAt = new Date();

		if (!quiet) {
			//#region ローカルの投稿なら削除アクティビティを配送
			if (isLocalUser(user) && !note.localOnly) {
				let renote: MiNote | null = null;

				this.globalEventService.publishNoteStream(note.id, 'madePrivate', {
					deletedAt: deletedAt,
				});

				// if deleted note is renote
				if (isPureRenote(note)) {
					renote = await this.notesRepository.findOneBy({
						id: note.renoteId,
					});
				}

				const content = this.apRendererService.addContext(renote
					? this.apRendererService.renderUndo(this.apRendererService.renderAnnounce(renote.uri ?? `${this.config.url}/notes/${renote.id}`, note), user)
					: this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${note.id}`), user));

				this.deliverToConcerned(user, note, content);
			}
		}

		this.searchService.unindexNote(note);

		await this.notesRepository.update(note.id, {
			visibility: 'specified',
		});

		// if (deleter && (note.userId !== deleter.id)) {
		// 	const user = await this.usersRepository.findOneByOrFail({ id: note.userId });
		// 	this.moderationLogService.log(deleter, 'deleteNote', {
		// 		noteId: note.id,
		// 		noteUserId: note.userId,
		// 		noteUserUsername: user.username,
		// 		noteUserHost: user.host,
		// 		note: note,
		// 	});
		// }
	}

	async makePrivateMany(user: { id: MiUser['id']; uri: MiUser['uri']; host: MiUser['host']; isBot: MiUser['isBot']; }, sinceDate: number, untilDate: number, countOnly = false) {
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
			if (await query.getCount() > 500) {
				throw new Error('too many notes');
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
	private async findCascadingNotes(note: MiNote): Promise<(MiNote & { user: MiUser })[]> {
		const cascadingNotes: MiNote[] = [];

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
		const cascade = async (layer: MiNote[]): Promise<void> => {
			const layerIds = layer.map(layer => layer.id);
			const refs = await this.notesRepository.find({
				where: [
					{ replyId: In(layerIds) },
					{ renoteId: In(layerIds) },
				],
				relations: { user: true },
			});

			// Stop when we reach the end of all threads
			if (refs.length === 0) return;

			cascadingNotes.push(...refs);
			await cascade(refs);
		};

		// Start with the origin, which should *not* be in the result set!
		await cascade([note]);

		// Type cast is safe - we load the relation above.
		return cascadingNotes as (MiNote & { user: MiUser })[];
	}

	@bindThis
	private async getMentionedRemoteUsers(note: MiNote) {
		const where = [] as any[];

		// mention / reply / dm
		const uris = (JSON.parse(note.mentionedRemoteUsers) as IMentionedRemoteUsers).map(x => x.uri);
		if (uris.length > 0) {
			where.push(
				{ uri: In(uris) },
			);
		}

		// renote / quote
		if (note.renoteUserId) {
			where.push({
				id: note.renoteUserId,
			});
		}

		if (where.length === 0) return [];

		return await this.usersRepository.find({
			where,
		}) as MiRemoteUser[];
	}

	@bindThis
	private async getRenotedOrRepliedRemoteUsers(note: MiNote) {
		const query = this.notesRepository.createQueryBuilder('note')
			.leftJoinAndSelect('note.user', 'user')
			.where(new Brackets(qb => {
				qb.orWhere('note.renoteId = :renoteId', { renoteId: note.id });
				qb.orWhere('note.replyId = :replyId', { replyId: note.id });
			}))
			.andWhere({ userHost: Not(IsNull()) });
		const notes = await query.getMany() as (MiNote & { user: MiRemoteUser })[];
		const remoteUsers = notes.map(({ user }) => user);
		return remoteUsers;
	}

	@bindThis
	private async deliverToConcerned(user: { id: MiLocalUser['id']; host: null; }, note: MiNote, content: any) {
		await this.apDeliverManagerService.deliverToFollowers(user, content);
		await this.apDeliverManagerService.deliverToUsers(user, content, [
			...await this.getMentionedRemoteUsers(note),
			...await this.getRenotedOrRepliedRemoteUsers(note),
		]);
		await this.relayService.deliverToRelays(user, content);
	}
}
