/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type { Packed } from '@/misc/json-schema.js';
import { CacheService } from '@/core/CacheService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { UserListService } from '@/core/UserListService.js';
import { bindThis } from '@/decorators.js';
import { isPackedPureRenote } from '@/misc/is-renote.js';
import type { JsonObject } from '@/misc/json-value.js';
import { NoteChannel, type Channel, type MiChannelService } from '../channel.js';

class UserListChannel extends NoteChannel {
	public readonly chName = 'userList';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:account';
	private listId: string;
	private withFiles: boolean;
	private withRenotes: boolean;

	constructor(
		id: string,
		connection: Channel['connection'],
		noteEntityService: NoteEntityService,

		private readonly cacheService: CacheService,
		private readonly userListService: UserListService,
	) {
		super(id, connection, noteEntityService);
		//this.updateListUsers = this.updateListUsers.bind(this);
		//this.onNote = this.onNote.bind(this);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (!this.user) return false;
		if (typeof params.listId !== 'string') return false;
		this.listId = params.listId;
		this.withFiles = !!(params.withFiles ?? false);
		this.withRenotes = !!(params.withRenotes ?? true);

		// Check existence and owner
		const listExist = await this.userListService.userListsCache.fetchMaybe(this.listId);
		if (!listExist) return false;
		if (!listExist.isPublic && listExist.userId !== this.user.id) return false;

		this.subscriber.on(`userListStream:${this.listId}`, this.send);
		this.subscriber.on('notesStream', this.onNote);
		return true;
	}

	@bindThis
	private async onNote(note: Packed<'Note'>) {
		if (note.channelId) return;
		if (this.withFiles && (note.fileIds == null || note.fileIds.length === 0)) return;
		if (!this.withRenotes && isPackedPureRenote(note)) return;

		const memberships = await this.cacheService.listUserMembershipsCache.fetch(this.listId);
		if (!memberships.has(note.userId)) return;

		const preparedNote = await this.prepareNote(note);
		if (preparedNote) {
			this.send('note', preparedNote);
		}
	}

	@bindThis
	public dispose() {
		// Unsubscribe events
		this.subscriber.off(`userListStream:${this.listId}`, this.send);
		this.subscriber.off('notesStream', this.onNote);
	}
}

@Injectable()
export class UserListChannelService implements MiChannelService<true> {
	public readonly shouldShare = UserListChannel.shouldShare;
	public readonly requireCredential = UserListChannel.requireCredential;
	public readonly kind = UserListChannel.kind;

	constructor(
		private readonly noteEntityService: NoteEntityService,
		private readonly cacheService: CacheService,
		private readonly userListService: UserListService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): UserListChannel {
		return new UserListChannel(
			id,
			connection,
			this.noteEntityService,
			this.cacheService,
			this.userListService,
		);
	}
}
