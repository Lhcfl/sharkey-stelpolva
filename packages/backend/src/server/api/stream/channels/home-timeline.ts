/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type { Packed } from '@/misc/json-schema.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { CacheService } from '@/core/CacheService.js';
import { bindThis } from '@/decorators.js';
import { isPackedPureRenote } from '@/misc/is-renote.js';
import type { JsonObject } from '@/misc/json-value.js';
import { Channel, NoteChannel, type MiChannelService } from '../channel.js';

class HomeTimelineChannel extends NoteChannel {
	public readonly chName = 'homeTimeline';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:account';
	private withRenotes: boolean;
	private withFiles: boolean;
	private withReplies: boolean;

	constructor(
		id: string,
		connection: Channel['connection'],
		noteEntityService: NoteEntityService,
		private readonly cacheService: CacheService,
	) {
		super(id, connection, noteEntityService);
	}

	@bindThis
	public async init(params: JsonObject) {
		if (!this.user) return;
		this.withRenotes = !!(params.withRenotes ?? true);
		this.withFiles = !!(params.withFiles ?? false);
		this.withReplies = !!(params.withReplies ?? false);

		this.subscriber.on('notesStream', this.onNote);
	}

	@bindThis
	private async onNote(note: Packed<'Note'>) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const userId = this.user!.id;
		const isMe = userId === note.userId;
		if (this.withFiles && (note.fileIds == null || note.fileIds.length === 0)) return;
		if (!this.withRenotes && isPackedPureRenote(note)) return;
		if (note.channelId) {
			if (!this.followingChannels?.has(note.channelId)) return;
		} else {
			// その投稿のユーザーをフォローしていなかったら弾く
			if (!isMe && !(await this.cacheService.getUserRelation(userId, note.userId)).isFollowing) return;
		}

		const preparedNote = await this.prepareNote(note);
		if (preparedNote) {
			this.send('note', preparedNote);
		}
	}

	@bindThis
	public dispose() {
		// Unsubscribe events
		this.subscriber.off('notesStream', this.onNote);
	}
}

@Injectable()
export class HomeTimelineChannelService implements MiChannelService<true> {
	public readonly shouldShare = HomeTimelineChannel.shouldShare;
	public readonly requireCredential = HomeTimelineChannel.requireCredential;
	public readonly kind = HomeTimelineChannel.kind;

	constructor(
		private noteEntityService: NoteEntityService,
		private readonly cacheService: CacheService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): HomeTimelineChannel {
		return new HomeTimelineChannel(
			id,
			connection,
			this.noteEntityService,
			this.cacheService,
		);
	}
}
