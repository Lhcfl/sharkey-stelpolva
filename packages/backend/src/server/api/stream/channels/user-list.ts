/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiUserListMembership, UserListMembershipsRepository, UserListsRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import type { Packed } from '@/misc/json-schema.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import Channel from '../channel.js';

class UserListChannel extends Channel {
	public readonly chName = 'userList';
	public static shouldShare = false;
	public static requireCredential = false;
	private listId: string;
	private membershipsMap: Record<string, Pick<MiUserListMembership, 'withReplies'> | undefined> = {};
	private listUsersClock: NodeJS.Timeout;
	private withFiles: boolean;

	constructor(
		private userListsRepository: UserListsRepository,
		private userListMembershipsRepository: UserListMembershipsRepository,
		private noteEntityService: NoteEntityService,

		id: string,
		connection: Channel['connection'],
	) {
		super(id, connection);
		//this.updateListUsers = this.updateListUsers.bind(this);
		//this.onNote = this.onNote.bind(this);
	}

	@bindThis
	public async init(params: any) {
		this.listId = params.listId as string;
		this.withFiles = params.withFiles ?? false;

		// Check existence and owner
		const listExist = await this.userListsRepository.exist({
			where: {
				id: this.listId,
				userId: this.user!.id,
			},
		});
		if (!listExist) return;

		// Subscribe stream
		this.subscriber.on(`userListStream:${this.listId}`, this.send);

		this.subscriber.on('notesStream', this.onNote);

		this.updateListUsers();
		this.listUsersClock = setInterval(this.updateListUsers, 5000);
	}

	@bindThis
	private async updateListUsers() {
		const memberships = await this.userListMembershipsRepository.find({
			where: {
				userListId: this.listId,
			},
			select: ['userId'],
		});

		const membershipsMap: Record<string, Pick<MiUserListMembership, 'withReplies'> | undefined> = {};
		for (const membership of memberships) {
			membershipsMap[membership.userId] = {
				withReplies: membership.withReplies,
			};
		}
		this.membershipsMap = membershipsMap;
	}

	@bindThis
	private async onNote(note: Packed<'Note'>) {
		if (this.withFiles && (note.fileIds == null || note.fileIds.length === 0)) return;

		if (!Object.hasOwn(this.membershipsMap, note.userId)) return;

		if (note.visibility === 'followers') {
			if (!Object.hasOwn(this.following, note.userId)) return;
		} else if (note.visibility === 'specified') {
			if (!note.visibleUserIds!.includes(this.user!.id)) return;
		}

		// 関係ない返信は除外
		if (note.reply && !this.membershipsMap[note.userId]?.withReplies) {
			const reply = note.reply;
			// 「チャンネル接続主への返信」でもなければ、「チャンネル接続主が行った返信」でもなければ、「投稿者の投稿者自身への返信」でもない場合
			if (reply.userId !== this.user!.id && note.userId !== this.user!.id && reply.userId !== note.userId) return;
		}

		// 流れてきたNoteがミュートしているユーザーが関わるものだったら無視する
		if (isUserRelated(note, this.userIdsWhoMeMuting)) return;
		// 流れてきたNoteがブロックされているユーザーが関わるものだったら無視する
		if (isUserRelated(note, this.userIdsWhoBlockingMe)) return;

		if (note.renote && !note.text && isUserRelated(note, this.userIdsWhoMeMutingRenotes)) return;

		if (this.user && note.renoteId && !note.text) {
			const myRenoteReaction = await this.noteEntityService.populateMyReaction(note.renoteId, this.user.id);
			note.renote!.myReaction = myRenoteReaction;
		}

		this.connection.cacheNote(note);

		this.send('note', note);
	}

	@bindThis
	public dispose() {
		// Unsubscribe events
		this.subscriber.off(`userListStream:${this.listId}`, this.send);
		this.subscriber.off('notesStream', this.onNote);

		clearInterval(this.listUsersClock);
	}
}

@Injectable()
export class UserListChannelService {
	public readonly shouldShare = UserListChannel.shouldShare;
	public readonly requireCredential = UserListChannel.requireCredential;

	constructor(
		@Inject(DI.userListsRepository)
		private userListsRepository: UserListsRepository,

		@Inject(DI.userListMembershipsRepository)
		private userListMembershipsRepository: UserListMembershipsRepository,

		private noteEntityService: NoteEntityService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): UserListChannel {
		return new UserListChannel(
			this.userListsRepository,
			this.userListMembershipsRepository,
			this.noteEntityService,
			id,
			connection,
		);
	}
}
