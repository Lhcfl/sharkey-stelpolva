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
import { errorCodes, IdentifiableError } from '@/misc/identifiable-error.js';
import type { JsonObject } from '@/misc/json-value.js';
import { type Channel, NoteChannel, type MiChannelService } from '../channel.js';

class GlobalTimelineChannel extends NoteChannel {
	public readonly chName = 'globalTimeline';
	public static shouldShare = false;
	public static requireCredential = false as const;
	private withRenotes: boolean;
	private withFiles: boolean;
	private withBots: boolean;

	constructor(
		id: string,
		connection: Channel['connection'],
		noteEntityService: NoteEntityService,

		private roleService: RoleService,
	) {
		super(id, connection, noteEntityService);
	}

	@bindThis
	public async init(params: JsonObject) {
		if (!this.subscriber) throw new IdentifiableError(errorCodes.websocketError, `Cannot init ${this.chName} channel: socket is not connected`);
		const policies = await this.roleService.getUserPolicies(this.user ? this.user.id : null);
		if (!policies.gtlAvailable) return;

		this.withRenotes = !!(params.withRenotes ?? true);
		this.withFiles = !!(params.withFiles ?? false);
		this.withBots = !!(params.withBots ?? true);

		this.subscriber.on('notesStream', this.onNote);
	}

	@bindThis
	private async onNote(note: Packed<'Note'>) {
		if (note.visibility !== 'public') return;
		if (note.channelId != null) return;
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
		this.subscriber?.off('notesStream', this.onNote);
	}
}

@Injectable()
export class GlobalTimelineChannelService implements MiChannelService<false> {
	public readonly shouldShare = GlobalTimelineChannel.shouldShare;
	public readonly requireCredential = GlobalTimelineChannel.requireCredential;
	public readonly kind = GlobalTimelineChannel.kind;

	constructor(
		private roleService: RoleService,
		private noteEntityService: NoteEntityService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): GlobalTimelineChannel {
		return new GlobalTimelineChannel(
			id,
			connection,
			this.noteEntityService,
			this.roleService,
		);
	}
}
