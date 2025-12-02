import { Inject, Injectable } from '@nestjs/common';
import { Not } from 'typeorm';
import { isPureRenote, MinimalNote } from '@/misc/is-renote.js';
import { SkLatestNote } from '@/models/LatestNote.js';
import { DI } from '@/di-symbols.js';
import type { LatestNotesRepository, MiNote, NotesRepository } from '@/models/_.js';
import { QueryService } from '@/core/QueryService.js';
import { QueueService } from '@/core/QueueService.js';

@Injectable()
export class LatestNoteService {
	constructor(
		@Inject(DI.notesRepository)
		private readonly notesRepository: NotesRepository,

		@Inject(DI.latestNotesRepository)
		private readonly latestNotesRepository: LatestNotesRepository,

		private readonly queryService: QueryService,
		private readonly queueService: QueueService,
	) {}

	async handleUpdatedNoteDeferred(note: MiNote): Promise<void> {
		await this.queueService.createUpdateLatestNoteJob(note);
	}

	async handleCreatedNoteDeferred(note: MiNote): Promise<void> {
		await this.queueService.createUpdateLatestNoteJob(note);
	}

	async handleDeletedNoteDeferred(note: MiNote): Promise<void> {
		await this.queueService.createUpdateLatestNoteJob(note);
	}

	async handleUpdatedNote(before: MinimalNote, after: MinimalNote): Promise<void> {
		// If the key didn't change, then there's nothing to update.
		if (SkLatestNote.areEquivalent(before, after)) return;

		// Simulate update as delete + create
		await this.handleDeletedNote(before);
		await this.handleCreatedNote(after);
	}

	async handleCreatedNote(note: MinimalNote): Promise<void> {
		// Ignore DMs.
		// Followers-only posts are *included*, as this table is used to back the "following" feed.
		if (note.visibility === 'specified') return;

		// Ignore pure renotes
		if (isPureRenote(note)) return;

		// Compute the compound key of the entry to check
		const key = SkLatestNote.keyFor(note);

		// Make sure that this isn't an *older* post.
		// We can get older posts through replies, lookups, updates, etc.
		const currentLatest = await this.latestNotesRepository.findOneBy(key);
		if (currentLatest != null && currentLatest.noteId >= note.id) return;

		// Record this as the latest note for the given user
		const latestNote = new SkLatestNote({
			...key,
			noteId: note.id,
		});
		await this.latestNotesRepository.upsert(latestNote, ['userId', 'isPublic', 'isReply', 'isQuote']);
	}

	async handleDeletedNote(note: MinimalNote): Promise<void> {
		// If it's a DM, then it can't possibly be the latest note so we can safely skip this.
		if (note.visibility === 'specified') return;

		// If it's a pure renote, then it can't possibly be the latest note so we can safely skip this.
		if (isPureRenote(note)) return;

		// Compute the compound key of the entry to check
		const key = SkLatestNote.keyFor(note);

		// Check if the deleted note was possibly the latest for the user
		const existingLatest = await this.latestNotesRepository.findOneBy(key);
		if (existingLatest == null || existingLatest.noteId !== note.id) return;

		// Find the newest remaining note for the user.
		// We exclude DMs and pure renotes.
		const query = this.notesRepository
			.createQueryBuilder('note')
			.select()
			.where({
				userId: key.userId,
				visibility: key.isPublic
					? 'public'
					: Not('specified'),
				replyId: key.isReply
					? Not(null)
					: null,
				renoteId: key.isQuote
					? Not(null)
					: null,
			})
			.orderBy({ id: 'DESC' });

		this.queryService.andIsNotRenote(query, 'note');

		const nextLatest = await query.getOne();
		if (!nextLatest) return;

		// Record it as the latest
		const latestNote = new SkLatestNote({
			...key,
			noteId: nextLatest.id,
		});

		// When inserting the latest note, it's possible that another worker has "raced" the insert and already added a newer note.
		// We must use orIgnore() to ensure that the query ignores conflicts, otherwise an exception may be thrown.
		await this.latestNotesRepository
			.createQueryBuilder('latest')
			.insert()
			.into(SkLatestNote)
			.values(latestNote)
			.orIgnore()
			.execute();
	}
}
