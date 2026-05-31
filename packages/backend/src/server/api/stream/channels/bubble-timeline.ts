/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type { Packed } from '@/misc/json-schema.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { bindThis } from '@/decorators.js';
import { RoleService } from '@/core/RoleService.js';
import type { JsonObject } from '@/misc/json-value.js';
import { UtilityService } from '@/core/UtilityService.js';
import { isPackedPureRenote } from '@/misc/is-renote.js';
import { type Channel, MiChannelService, NoteChannel } from '../channel.js';

class BubbleTimelineChannel extends NoteChannel {
	public readonly chName = 'bubbleTimeline';
	public static shouldShare = false;
	public static requireCredential = false as const;
	private withRenotes: boolean;
	private withReplies: boolean;
	private withFiles: boolean;
	private withBots: boolean;

	constructor(
		id: string,
		connection: Channel['connection'],
		noteEntityService: NoteEntityService,

		private roleService: RoleService,
		private readonly utilityService: UtilityService,
	) {
		super(id, connection, noteEntityService);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		const policies = await this.roleService.getUserPolicies(this.user);
		if (!policies.btlAvailable) return false;

		this.withRenotes = !!(params.withRenotes ?? true);
		this.withFiles = !!(params.withFiles ?? false);
		this.withBots = !!(params.withBots ?? true);

		this.subscriber.on('notesStream', this.onNote);

		return true;
	}

	@bindThis
	private async onNote(note: Packed<'Note'>) {
		if (note.channelId != null) return;
		if (note.visibility !== 'public') return;
		if (!this.utilityService.isBubbledHost(note.user.host)) return;
		if (this.withFiles && (note.fileIds == null || note.fileIds.length === 0)) return;
		if (!this.withBots && note.user.isBot) return;
		if (!this.withRenotes && isPackedPureRenote(note)) return;

		const preparedNote = await this.prepareNote(note);
		if (preparedNote) {
			this.send('note', preparedNote);
		}
	}

	@bindThis
	public dispose() {
		this.subscriber.off('notesStream', this.onNote);
	}
}

@Injectable()
export class BubbleTimelineChannelService implements MiChannelService<false> {
	public readonly shouldShare = BubbleTimelineChannel.shouldShare;
	public readonly requireCredential = BubbleTimelineChannel.requireCredential;
	public readonly kind = BubbleTimelineChannel.kind;

	constructor(
		private roleService: RoleService,
		private noteEntityService: NoteEntityService,
		private readonly utilityService: UtilityService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): BubbleTimelineChannel {
		return new BubbleTimelineChannel(
			id,
			connection,
			this.noteEntityService,
			this.roleService,
			this.utilityService,
		);
	}
}
