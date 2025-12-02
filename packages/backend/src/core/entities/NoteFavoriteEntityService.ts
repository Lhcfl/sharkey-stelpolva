/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiNote, NoteFavoritesRepository } from '@/models/_.js';
import type { } from '@/models/Blocking.js';
import type { MiUser } from '@/models/User.js';
import type { MiNoteFavorite } from '@/models/NoteFavorite.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import type { Packed } from '@/misc/json-schema.js';
import { NoteEntityService } from './NoteEntityService.js';

@Injectable()
export class NoteFavoriteEntityService {
	constructor(
		@Inject(DI.noteFavoritesRepository)
		private noteFavoritesRepository: NoteFavoritesRepository,

		private noteEntityService: NoteEntityService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async pack(
		src: MiNoteFavorite['id'] | MiNoteFavorite,
		me?: { id: MiUser['id'] } | null | undefined,
		notes?: Map<string, Packed<'Note'>>,
	) {
		const favorite = typeof src === 'object' ? src : await this.noteFavoritesRepository.findOneByOrFail({ id: src });

		return {
			id: favorite.id,
			createdAt: this.idService.parse(favorite.id).date.toISOString(),
			noteId: favorite.noteId,
			note: notes?.get(favorite.noteId) ?? await this.noteEntityService.pack(favorite.note ?? favorite.noteId, me),
		};
	}

	@bindThis
	public async packMany(
		favorites: (MiNoteFavorite & { note: MiNote })[],
		me: { id: MiUser['id'] },
	) {
		const packedNotes = await this.noteEntityService.packMany(favorites.map(f => f.note), me);
		const packedNotesMap = new Map(packedNotes.map(n => [n.id, n]));

		return Promise.all(favorites.map(x => this.pack(x, me, packedNotesMap)));
	}
}
