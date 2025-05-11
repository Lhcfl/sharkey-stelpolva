/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import type { MiNote, NotesRepository } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import { ApiError } from '../error.js';

/**
 * Utility service for accessing data with Mastodon semantics
 */
@Injectable()
export class MastodonDataService {
	constructor(
		@Inject(DI.notesRepository)
		private readonly notesRepository: NotesRepository,

		@Inject(QueryService)
		private readonly queryService: QueryService,
	) {}

	/**
	 * Fetches a note in the context of the current user, and throws an exception if not found.
	 */
	public async requireNote(noteId: string, me?: MiLocalUser | null): Promise<MiNote> {
		const note = await this.getNote(noteId, me);

		if (!note) {
			throw new ApiError({
				message: 'No such note.',
				code: 'NO_SUCH_NOTE',
				id: '24fcbfc6-2e37-42b6-8388-c29b3861a08d',
				kind: 'client',
				httpStatusCode: 404,
			});
		}

		return note;
	}

	/**
	 * Fetches a note in the context of the current user.
	 */
	public async getNote(noteId: string, me?: MiLocalUser | null): Promise<MiNote | null> {
		// Root query: note + required dependencies
		const query = this.notesRepository
			.createQueryBuilder('note')
			.where('note.id = :noteId', { noteId })
			.innerJoinAndSelect('note.user', 'user');

		// Restrict visibility
		this.queryService.generateVisibilityQuery(query, me);
		if (me) {
			this.queryService.generateBlockedUserQueryForNotes(query, me);
		}

		return await query.getOne();
	}

	/**
	 * Checks where the current user has made a reblog / boost / pure renote of a given target note.
	 */
	public async hasReblog(noteId: string, me: MiLocalUser | null | undefined): Promise<boolean> {
		if (!me) return false;

		return await this.notesRepository.existsBy({
			// Reblog of the target note by me
			userId: me.id,
			renoteId: noteId,

			// That is pure (not a quote)
			text: IsNull(),
			cw: IsNull(),
			replyId: IsNull(),
			hasPoll: false,
			fileIds: '{}',
		});
	}
}
