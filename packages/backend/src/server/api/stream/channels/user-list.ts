/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiUserListMembership, UserListMembershipsRepository, UserListsRepository } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { UserListService } from '@/core/UserListService.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { isPackedPureRenote } from '@/misc/is-renote.js';
import type { JsonObject } from '@/misc/json-value.js';
import Channel, { type MiChannelService } from '../channel.js';

class UserListChannel extends Channel {
	public readonly chName = 'userList';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:account';
	private listId: string;
	private withFiles: boolean;
	private withRenotes: boolean;

	constructor(
		private userListsRepository: UserListsRepository,
		private userListMembershipsRepository: UserListMembershipsRepository,
		private readonly userListService: UserListService,
		noteEntityService: NoteEntityService,

		id: string,
		connection: Channel['connection'],
	) {
		super(id, connection, noteEntityService);
		//this.updateListUsers = this.updateListUsers.bind(this);
		//this.onNote = this.onNote.bind(this);
	}

	@bindThis
	public async init(params: JsonObject) {
		if (typeof params.listId !== 'string') return;
		this.listId = params.listId;
		this.withFiles = !!(params.withFiles ?? false);
		this.withRenotes = !!(params.withRenotes ?? true);

		// Check existence and owner
		const listExist = await this.userListService.userListsCache.fetchMaybe(this.listId);
		if (!listExist) return;
		if (!listExist.isPublic && listExist.userId !== this.user?.id) return;

		// Subscribe stream
		this.subscriber?.on(`userListStream:${this.listId}`, this.send);

		this.subscriber?.on('notesStream', this.onNote);
	}

	@bindThis
	private async onNote(note: Packed<'Note'>) {
		// チャンネル投稿は無視する
		if (note.channelId) return;

		if (this.withFiles && (note.fileIds == null || note.fileIds.length === 0)) return;

		const memberships = await this.cacheService.listUserMembershipsCache.fetch(this.listId);
		if (!memberships.has(note.userId)) return;

		const { accessible, silence } = await this.checkNoteVisibility(note, { includeReplies: true, listContext: this.listId });
		if (!accessible || silence) return;
		if (!this.withRenotes && isPackedPureRenote(note)) return;

		const clonedNote = await this.rePackNote(note);
		this.send('note', clonedNote);
	}

	@bindThis
	public dispose() {
		// Unsubscribe events
		this.subscriber?.off(`userListStream:${this.listId}`, this.send);
		this.subscriber?.off('notesStream', this.onNote);
	}
}

@Injectable()
export class UserListChannelService implements MiChannelService<true> {
	public readonly shouldShare = UserListChannel.shouldShare;
	public readonly requireCredential = UserListChannel.requireCredential;
	public readonly kind = UserListChannel.kind;

	constructor(
		@Inject(DI.userListsRepository)
		private userListsRepository: UserListsRepository,

		@Inject(DI.userListMembershipsRepository)
		private userListMembershipsRepository: UserListMembershipsRepository,

		private noteEntityService: NoteEntityService,
		private readonly userListService: UserListService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): UserListChannel {
		return new UserListChannel(
			this.userListsRepository,
			this.userListMembershipsRepository,
			this.userListService,
			this.noteEntityService,
			id,
			connection,
		);
	}
}
