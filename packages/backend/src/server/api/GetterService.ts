/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { NotesRepository, UsersRepository, NoteEditsRepository } from '@/models/_.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import type { MiLocalUser, MiRemoteUser, MiUser } from '@/models/User.js';
import { isRemoteUser, isLocalUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import { CacheService } from '@/core/CacheService.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class GetterService {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.noteEditsRepository)
		private noteEditsRepository: NoteEditsRepository,

		private readonly cacheService: CacheService,
	) {
	}

	/**
	 * Get note for API processing
	 */
	@bindThis
	public async getNote(noteId: MiNote['id']) {
		const note = await this.notesRepository.findOneBy({ id: noteId });

		if (note == null) {
			throw new IdentifiableError('9725d0ce-ba28-4dde-95a7-2cbb2c15de24', `Note ${noteId} does not exist`);
		}

		return note;
	}

	@bindThis
	public async getNoteWithUser(noteId: MiNote['id']) {
		const note = await this.notesRepository.findOne({ where: { id: noteId }, relations: ['user'] });

		if (note == null) {
			throw new IdentifiableError('9725d0ce-ba28-4dde-95a7-2cbb2c15de24', `Note ${noteId} does not exist`);
		}

		return note;
	}

	/**
	 * Get note for API processing
	 */
	@bindThis
	public async getEdits(noteId: MiNote['id']) {
		const edits = await this.noteEditsRepository.findBy({ noteId: noteId }).catch(() => {
			throw new IdentifiableError('9725d0ce-ba28-4dde-95a7-2cbb2c15de24', `Note ${noteId} does not exist`);
		});

		return edits;
	}

	/**
	 * Get user for API processing
	 */
	@bindThis
	public async getUser(userId: MiUser['id']) {
		const user = await this.cacheService.findOptionalUserById(userId);

		if (user == null) {
			throw new IdentifiableError('15348ddd-432d-49c2-8a5a-8069753becff', `User ${userId} does not exist`);
		}

		return user as MiLocalUser | MiRemoteUser;
	}

	/**
	 * Get remote user for API processing
	 */
	@bindThis
	public async getRemoteUser(userId: MiUser['id']) {
		const user = await this.getUser(userId);

		if (!isRemoteUser(user)) {
			throw new IdentifiableError('aeac1339-2550-4521-a8e3-781f06d98656', 'User is not remote');
		}

		return user;
	}

	/**
	 * Get local user for API processing
	 */
	@bindThis
	public async getLocalUser(userId: MiUser['id']) {
		const user = await this.getUser(userId);

		if (!isLocalUser(user)) {
			throw new IdentifiableError('aeac1339-2550-4521-a8e3-781f06d98656', 'User is not local');
		}

		return user;
	}
}

