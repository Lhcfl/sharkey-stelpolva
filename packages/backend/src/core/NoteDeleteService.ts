/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets, In, Not } from 'typeorm';
import { Injectable, Inject } from '@nestjs/common';
import type { MiUser, MiLocalUser, MiRemoteUser } from '@/models/User.js';
import type { MiNote, IMentionedRemoteUsers } from '@/models/Note.js';
import { LatestNote } from '@/models/LatestNote.js';
import type { InstancesRepository, LatestNotesRepository, NotesRepository, UsersRepository } from '@/models/_.js';
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
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { bindThis } from '@/decorators.js';
import { MetaService } from '@/core/MetaService.js';
import { SearchService } from '@/core/SearchService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import { IdService } from '@/core/IdService.js';

@Injectable()
export class NoteDeleteService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.latestNotesRepository)
		private latestNotesRepository: LatestNotesRepository,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		private idService: IdService,
		private userEntityService: UserEntityService,
		private noteEntityService: NoteEntityService,
		private globalEventService: GlobalEventService,
		private relayService: RelayService,
		private federatedInstanceService: FederatedInstanceService,
		private apRendererService: ApRendererService,
		private apDeliverManagerService: ApDeliverManagerService,
		private metaService: MetaService,
		private searchService: SearchService,
		private moderationLogService: ModerationLogService,
		private notesChart: NotesChart,
		private perUserNotesChart: PerUserNotesChart,
		private instanceChart: InstanceChart,
	) {}

	/**
	 * 投稿を削除します。
	 * @param user 投稿者
	 * @param note 投稿
	 */
	async delete(user: { id: MiUser['id']; uri: MiUser['uri']; host: MiUser['host']; isBot: MiUser['isBot']; }, note: MiNote, quiet = false, deleter?: MiUser) {
		const deletedAt = new Date();
		const cascadingNotes = await this.findCascadingNotes(note);

		if (note.replyId) {
			await this.notesRepository.decrement({ id: note.replyId }, 'repliesCount', 1);
		}

		if (note.renoteId && note.text == null && !note.hasPoll && (note.fileIds == null || note.fileIds.length === 0)) {
			await this.notesRepository.findOneBy({ id: note.renoteId }).then(async (renote) => {
				if (!renote) return;
				if (renote.userId !== user.id) await this.notesRepository.decrement({ id: renote.id }, 'renoteCount', 1);
			});
		}

		if (!quiet) {
			this.globalEventService.publishNoteStream(note.id, 'deleted', {
				deletedAt: deletedAt,
			});

			for (const cascadingNote of cascadingNotes) {
				this.globalEventService.publishNoteStream(cascadingNote.id, 'deleted', {
					deletedAt: deletedAt,
				});
			}

			//#region ローカルの投稿なら削除アクティビティを配送
			if (this.userEntityService.isLocalUser(user) && !note.localOnly) {
				let renote: MiNote | null = null;

				// if deleted note is renote
				if (isRenote(note) && !isQuote(note)) {
					renote = await this.notesRepository.findOneBy({
						id: note.renoteId,
					});
				}

				const content = this.apRendererService.addContext(renote
					? this.apRendererService.renderUndo(this.apRendererService.renderAnnounce(renote.uri ?? `${this.config.url}/notes/${renote.id}`, note), user)
					: this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${note.id}`), user));

				this.deliverToConcerned(user, note, content);
			}

			// also deliver delete activity to cascaded notes
			const federatedLocalCascadingNotes = (cascadingNotes).filter(note => !note.localOnly && note.userHost == null); // filter out local-only notes
			for (const cascadingNote of federatedLocalCascadingNotes) {
				if (!cascadingNote.user) continue;
				if (!this.userEntityService.isLocalUser(cascadingNote.user)) continue;
				const content = this.apRendererService.addContext(this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${cascadingNote.id}`), cascadingNote.user));
				this.deliverToConcerned(cascadingNote.user, cascadingNote, content);
			}
			//#endregion

			const meta = await this.metaService.fetch();

			this.notesChart.update(note, false);
			if (meta.enableChartsForRemoteUser || (user.host == null)) {
				this.perUserNotesChart.update(user, note, false);
			}

			if (this.userEntityService.isRemoteUser(user)) {
				this.federatedInstanceService.fetch(user.host).then(async i => {
					if (note.renoteId && note.text) {
						this.instancesRepository.decrement({ id: i.id }, 'notesCount', 1);
					} else if (!note.renoteId) {
						this.instancesRepository.decrement({ id: i.id }, 'notesCount', 1);
					}
					if ((await this.metaService.fetch()).enableChartsForFederatedInstances) {
						this.instanceChart.updateNote(i.host, note, false);
					}
				});
			}
		}

		for (const cascadingNote of cascadingNotes) {
			this.searchService.unindexNote(cascadingNote);
		}
		this.searchService.unindexNote(note);

		await this.notesRepository.delete({
			id: note.id,
			userId: user.id,
		});

		await this.updateLatestNote(note);
		if (!quiet) {
			if (note.renoteId && note.text) {
				// Decrement notes count (user)
				this.decNotesCountOfUser(user);
			} else if (!note.renoteId) {
				// Decrement notes count (user)
				this.decNotesCountOfUser(user);
			}
		}

		if (deleter && (note.userId !== deleter.id)) {
			const user = await this.usersRepository.findOneByOrFail({ id: note.userId });
			this.moderationLogService.log(deleter, 'deleteNote', {
				noteId: note.id,
				noteUserId: note.userId,
				noteUserUsername: user.username,
				noteUserHost: user.host,
				note: note,
			});
		}
	}

	/**
	 * 投稿をmake privateします。
	 * @param user 投稿者
	 * @param note 投稿
	 */
	async makePrivate(user: { id: MiUser['id']; uri: MiUser['uri']; host: MiUser['host']; isBot: MiUser['isBot']; }, note: MiNote, quiet = false, deleter?: MiUser) {
		if (this.userEntityService.isRemoteUser(user)) {
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
			if (this.userEntityService.isLocalUser(user) && !note.localOnly) {
				let renote: MiNote | null = null;

				this.globalEventService.publishNoteStream(note.id, 'madePrivate', {
					deletedAt: deletedAt,
				});

				// if deleted note is renote
				if (isRenote(note) && !isQuote(note)) {
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
			const shouldMakePrivateNotes = await query.getMany();
			for (const note of shouldMakePrivateNotes) {
				this.makePrivate(user, note);
			}
			return shouldMakePrivateNotes.length;
		}
	}

	@bindThis
	private decNotesCountOfUser(user: { id: MiUser['id']; host: MiUser['host'] }) {
		if (this.userEntityService.isLocalUser(user)) {
			this.notesRepository.createQueryBuilder().where(
				'"userId" = :userId', { userId: user.id },
			).andWhere(
				'NOT ("renoteId" IS NOT NULL AND text is NULL)',
			).getCount().then((newCount: number) => {
				this.usersRepository.update(user.id, { updatedAt: new Date(), notesCount: newCount });
			});
		} else {
			this.usersRepository.createQueryBuilder().update()
				.set({
					updatedAt: new Date(),
					notesCount: () => '"notesCount" - 1',
				})
				.where('id = :id', { id: user.id })
				.execute();
		}
	}

	@bindThis
	private async findCascadingNotes(note: MiNote): Promise<MiNote[]> {
		const recursive = async (noteId: string): Promise<MiNote[]> => {
			const query = this.notesRepository.createQueryBuilder('note')
				.where('note.replyId = :noteId', { noteId })
				.orWhere(new Brackets(q => {
					q.where('note.renoteId = :noteId', { noteId })
						.andWhere('note.text IS NOT NULL');
				}))
				.leftJoinAndSelect('note.user', 'user');
			const replies = await query.getMany();

			return [
				replies,
				...await Promise.all(replies.map(reply => recursive(reply.id))),
			].flat();
		};

		const cascadingNotes: MiNote[] = await recursive(note.id);

		return cascadingNotes;
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
	private async deliverToConcerned(user: { id: MiLocalUser['id']; host: null; }, note: MiNote, content: any) {
		this.apDeliverManagerService.deliverToFollowers(user, content);
		this.relayService.deliverToRelays(user, content);
		const remoteUsers = await this.getMentionedRemoteUsers(note);
		for (const remoteUser of remoteUsers) {
			this.apDeliverManagerService.deliverToUser(user, content, remoteUser);
		}
	}

	private async updateLatestNote(note: MiNote) {
		// If it's a DM, then it can't possibly be the latest note so we can safely skip this.
		if (note.visibility === 'specified') return;

		// Check if the deleted note was possibly the latest for the user
		const hasLatestNote = await this.latestNotesRepository.existsBy({ userId: note.userId });
		if (hasLatestNote) return;

		// Find the newest remaining note for the user.
		// We exclude DMs and pure renotes.
		const nextLatest = await this.notesRepository
			.createQueryBuilder('note')
			.select()
			.where({
				userId: note.userId,
				visibility: Not('specified'),
			})
			.andWhere(`
				(
					note."renoteId" IS NULL
					OR note.text IS NOT NULL
					OR note.cw IS NOT NULL
					OR note."replyId" IS NOT NULL
					OR note."hasPoll"
					OR note."fileIds" != '{}'
				)
			`)
			.orderBy({ id: 'DESC' })
			.getOne();
		if (!nextLatest) return;

		// Record it as the latest
		const latestNote = new LatestNote({
			userId: note.userId,
			noteId: nextLatest.id,
		});

		// When inserting the latest note, it's possible that another worker has "raced" the insert and already added a newer note.
		// We must use orIgnore() to ensure that the query ignores conflicts, otherwise an exception may be thrown.
		await this.latestNotesRepository
			.createQueryBuilder('latest')
			.insert()
			.into(LatestNote)
			.values(latestNote)
			.orIgnore()
			.execute();
	}
}
