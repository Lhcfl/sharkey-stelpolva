/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type { Packed } from '@/misc/json-schema.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { bindThis } from '@/decorators.js';
import { RoleService } from '@/core/RoleService.js';
import { isPackedPureRenote } from '@/misc/is-renote.js';
import type { JsonObject } from '@/misc/json-value.js';
import { isReply } from '@/misc/is-reply.js';
import { errorCodes, IdentifiableError } from '@/misc/identifiable-error.js';
import { type Channel, NoteChannel, type MiChannelService } from '../channel.js';

class HybridTimelineChannel extends NoteChannel {
	public readonly chName = 'hybridTimeline';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:account';
	private withRenotes: boolean;
	private withReplies: boolean;
	private withBots: boolean;
	private withFiles: boolean;

	constructor(
		id: string,
		connection: Channel['connection'],
		noteEntityService: NoteEntityService,

		private roleService: RoleService,
	) {
		super(id, connection, noteEntityService);
	}

	@bindThis
	public async init(params: JsonObject): Promise<void> {
		if (!this.subscriber) throw new IdentifiableError(errorCodes.websocketError, `Cannot init ${this.chName} channel: socket is not connected`);
		const policies = await this.roleService.getUserPolicies(this.user);
		if (!policies.ltlAvailable) return;

		this.withRenotes = !!(params.withRenotes ?? true);
		this.withReplies = !!(params.withReplies ?? false);
		this.withFiles = !!(params.withFiles ?? false);
		this.withBots = !!(params.withBots ?? true);

		this.subscriber.on('notesStream', this.onNote);
	}

	@bindThis
	private async onNote(note: Packed<'Note'>) {
		const isMe = this.user?.id === note.userId;

		if (this.withFiles && (note.fileIds == null || note.fileIds.length === 0)) return;
		if (!this.withBots && note.user.isBot) return;
		if (!this.withRenotes && isPackedPureRenote(note)) return;
		if (!this.withReplies && isReply(note)) return;

		// チャンネルの投稿ではなく、自分自身の投稿 または
		// チャンネルの投稿ではなく、その投稿のユーザーをフォローしている または
		// チャンネルの投稿ではなく、全体公開のローカルの投稿 または
		// フォローしているチャンネルの投稿 の場合だけ
		if (!(
			(note.channelId == null && isMe) ||
			(note.channelId == null && this.following.has(note.userId)) ||
			(note.channelId == null && (note.user.host == null && note.visibility === 'public')) ||
			(note.channelId != null && this.followingChannels.has(note.channelId))
		)) return;

		const preparedNote = await this.prepareNote(note);
		if (preparedNote) {
			this.send('note', preparedNote);
		}
	}

	@bindThis
	public dispose(): void {
		// Unsubscribe events
		this.subscriber?.off('notesStream', this.onNote);
	}
}

@Injectable()
export class HybridTimelineChannelService implements MiChannelService<true> {
	public readonly shouldShare = HybridTimelineChannel.shouldShare;
	public readonly requireCredential = HybridTimelineChannel.requireCredential;
	public readonly kind = HybridTimelineChannel.kind;

	constructor(
		private roleService: RoleService,
		private noteEntityService: NoteEntityService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): HybridTimelineChannel {
		return new HybridTimelineChannel(
			id,
			connection,
			this.noteEntityService,
			this.roleService,
		);
	}
}
