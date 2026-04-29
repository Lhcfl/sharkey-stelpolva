/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { isUserFromMutedInstance } from '@/misc/is-instance-muted.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { bindThis } from '@/decorators.js';
import { errorCodes, IdentifiableError } from '@/misc/identifiable-error.js';
import type { JsonObject } from '@/misc/json-value.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { type Channel, NoteChannel, type MiChannelService } from '../channel.js';

// TODO does not need to be NoteChannel?
class MainChannel extends NoteChannel {
	public readonly chName = 'main';
	public static shouldShare = true;
	public static requireCredential = true as const;
	public static kind = 'read:account';

	constructor(
		id: string,
		connection: Channel['connection'],
		noteEntityService: NoteEntityService,
	) {
		super(id, connection, noteEntityService);
	}

	@bindThis
	public async init(): Promise<boolean> {
		if (!this.user) return false;
		if (!this.subscriber) throw new IdentifiableError(errorCodes.websocketError, `Cannot init ${this.chName} channel: socket is not connected`);

		this.subscriber.on(`mainStream:${this.user.id}`, this.onEvent);

		return true;
	}

	@bindThis
	private async onEvent(data: GlobalEvents['main']['payload']): Promise<void> {
		switch (data.type) {
			case 'notification': {
				// Ignore notifications from instances the user has muted
				if (isUserFromMutedInstance(data.body, this.userMutedInstances)) return;
				if (data.body.userId && this.userIdsWhoMeMuting.has(data.body.userId)) return;

				if (data.body.note) {
					const preparedNote = await this.prepareNote(data.body.note);
					if (!preparedNote) return;

					data.body.note = preparedNote;
				}
				break;
			}
			case 'mention': {
				const preparedNote = await this.prepareNote(data.body);
				if (preparedNote) {
					this.send(data.type, preparedNote);
				}
				return;
			}
		}

		this.send(data.type, data.body);
	}

	@bindThis
	public dispose() {
		this.subscriber?.off(`mainStream:${this.user?.id}`, this.onEvent);
	}
}

@Injectable()
export class MainChannelService implements MiChannelService<true> {
	public readonly shouldShare = MainChannel.shouldShare;
	public readonly requireCredential = MainChannel.requireCredential;
	public readonly kind = MainChannel.kind;

	constructor(
		private noteEntityService: NoteEntityService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): MainChannel {
		return new MainChannel(
			id,
			connection,
			this.noteEntityService,
		);
	}
}
