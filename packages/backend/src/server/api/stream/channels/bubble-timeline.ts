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
import Channel, { MiChannelService } from '../channel.js';

class BubbleTimelineChannel extends Channel {
	public readonly chName = 'bubbleTimeline';
	public static shouldShare = false;
	public static requireCredential = false as const;
	private withRenotes: boolean;
	private withReplies: boolean;
	private withFiles: boolean;
	private withBots: boolean;

	constructor(
		private roleService: RoleService,
		private readonly utilityService: UtilityService,
		noteEntityService: NoteEntityService,

		id: string,
		connection: Channel['connection'],
	) {
		super(id, connection, noteEntityService);
	}

	@bindThis
	public async init(params: JsonObject) {
		const policies = await this.roleService.getUserPolicies(this.user ? this.user.id : null);
		if (!policies.btlAvailable) return;

		this.withRenotes = !!(params.withRenotes ?? true);
		this.withFiles = !!(params.withFiles ?? false);
		this.withBots = !!(params.withBots ?? true);

		// Subscribe events
		this.subscriber?.on('notesStream', this.onNote);
	}

	@bindThis
	private async onNote(note: Packed<'Note'>) {
		if (this.withFiles && (note.fileIds == null || note.fileIds.length === 0)) return;
		if (!this.withBots && note.user.isBot) return;

		if (note.visibility !== 'public') return;
		if (note.channelId != null) return;
		if (!this.utilityService.isBubbledHost(note.user.host)) return;

		const { accessible, silence } = await this.checkNoteVisibility(note);
		if (!accessible || silence) return;
		if (!this.withRenotes && isPackedPureRenote(note)) return;

		const clonedNote = await this.rePackNote(note);
		this.send('note', clonedNote);
	}

	@bindThis
	public dispose() {
		// Unsubscribe events
		this.subscriber?.off('notesStream', this.onNote);
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
			this.roleService,
			this.utilityService,
			this.noteEntityService,
			id,
			connection,
		);
	}
}
