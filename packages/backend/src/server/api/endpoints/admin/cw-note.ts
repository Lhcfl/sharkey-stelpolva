/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ChannelsRepository, DriveFilesRepository, MiNote, NotesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { NoteEditService, Option } from '@/core/NoteEditService.js';
import { CacheService } from '@/core/CacheService.js';
import { awaitAll } from '@/misc/prelude/await-all.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:cw-note',

	res: {},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		cw: { type: 'string', nullable: true },
	},
	required: ['noteId', 'cw'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private readonly notesRepository: NotesRepository,

		@Inject(DI.driveFilesRepository)
		private readonly driveFilesRepository: DriveFilesRepository,

		@Inject(DI.channelsRepository)
		private readonly channelsRepository: ChannelsRepository,

		private readonly noteEditService: NoteEditService,
		private readonly moderationLogService: ModerationLogService,
		private readonly cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const note = await this.notesRepository.findOneOrFail({
				where: { id: ps.noteId },
				relations: { reply: true, renote: true, channel: true },
			});
			const user = await this.cacheService.findUserById(note.userId);

			// Collapse empty strings to null
			const newCW = ps.cw?.trim() || null;
			const oldCW = note.mandatoryCW;

			// Skip if there's nothing to do
			if (oldCW === newCW) return;

			// TODO remove this after merging hazelnoot/fix-note-edit-logic.
			//		Until then, we have to ensure that everything is populated just like it would be from notes/edit.ts.
			//		Otherwise forcing a CW will erase everything else in the note.
			//		After merging remove all the "createUpdate" stuff and just pass "{ mandatoryCW: newCW }" into noteEditService.edit().
			const update = await this.createUpdate(note, newCW);
			await this.noteEditService.edit(user, note.id, update);

			await this.moderationLogService.log(me, 'setMandatoryCWForNote', {
				newCW,
				oldCW,
				noteId: note.id,
				noteUserId: user.id,
				noteUserUsername: user.username,
				noteUserHost: user.host,
			});
		});
	}

	// Note: user must be fetched with reply, renote, and channel relations populated
	private async createUpdate(note: MiNote, newCW: string | null) {
		// This is based on the call to NoteEditService.edit from notes/edit endpoint.
		// noinspection ES6MissingAwait
		return await awaitAll<Option>({
			// Preserve these from original note
			files: note.fileIds.length > 0
				? this.driveFilesRepository.findBy({ id: In(note.fileIds) }) : null,
			poll: undefined,
			text: undefined,
			cw: undefined,
			reply: note.reply
				?? (note.replyId ? this.notesRepository.findOneByOrFail({ id: note.replyId }) : null),
			renote: note.renote
				?? (note.renoteId ? this.notesRepository.findOneByOrFail({ id: note.renoteId }) : null),
			localOnly: note.localOnly,
			reactionAcceptance: note.reactionAcceptance,
			visibility: note.visibility,
			visibleUsers: note.visibleUserIds.length > 0
				? this.cacheService.getUsers(note.visibleUserIds).then(us => Array.from(us.values())) : null,
			channel: note.channel ?? (note.channelId ? this.channelsRepository.findOneByOrFail({ id: note.channelId }) : null),
			apMentions: undefined,
			apHashtags: undefined,
			apEmojis: undefined,

			// But override the mandatory CW!
			mandatoryCW: newCW,
		});
	}
}
