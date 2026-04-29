/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { bindThis } from '@/decorators.js';
import { RoleService } from '@/core/RoleService.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import type { JsonObject } from '@/misc/json-value.js';
import { errorCodes, IdentifiableError } from '@/misc/identifiable-error.js';
import { type Channel, NoteChannel, type MiChannelService } from '../channel.js';

class RoleTimelineChannel extends NoteChannel {
	public readonly chName = 'roleTimeline';
	public static shouldShare = false;
	public static requireCredential = false as const;
	private roleId: string;

	constructor(
		id: string,
		connection: Channel['connection'],
		noteEntityService: NoteEntityService,

		private roleservice: RoleService,
	) {
		super(id, connection, noteEntityService);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (!this.subscriber) throw new IdentifiableError(errorCodes.websocketError, `Cannot init ${this.chName} channel: socket is not connected`);
		if (typeof params.roleId !== 'string') return false;
		this.roleId = params.roleId;

		if (!(await this.roleservice.isExplorable({ id: this.roleId }))) return false;

		this.subscriber.on(`roleTimelineStream:${this.roleId}`, this.onEvent);

		return true;
	}

	@bindThis
	private async onEvent(data: GlobalEvents['roleTimeline']['payload']) {
		const note = data.body;

		if (note.visibility !== 'public') return;

		const preparedNote = await this.prepareNote(note);
		if (preparedNote) {
			this.send('note', preparedNote);
		}
	}

	@bindThis
	public dispose() {
		// Unsubscribe events
		this.subscriber?.off(`roleTimelineStream:${this.roleId}`, this.onEvent);
	}
}

@Injectable()
export class RoleTimelineChannelService implements MiChannelService<false> {
	public readonly shouldShare = RoleTimelineChannel.shouldShare;
	public readonly requireCredential = RoleTimelineChannel.requireCredential;
	public readonly kind = RoleTimelineChannel.kind;

	constructor(
		private noteEntityService: NoteEntityService,
		private roleservice: RoleService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): RoleTimelineChannel {
		return new RoleTimelineChannel(
			id,
			connection,
			this.noteEntityService,
			this.roleservice,
		);
	}
}
