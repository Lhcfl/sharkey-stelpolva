/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { isUserFromMutedInstance } from '@/misc/is-instance-muted.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { CacheService } from '@/core/CacheService.js';
import { bindThis } from '@/decorators.js';
import type { MainEventPayload } from '@/core/GlobalEventService.js';
import { type Channel, NoteChannel, type MiChannelService } from '../channel.js';

class MainChannel extends NoteChannel {
	public readonly chName = 'main';
	public static shouldShare = true;
	public static requireCredential = true as const;
	public static kind = 'read:account';

	constructor(
		id: string,
		connection: Channel['connection'],
		noteEntityService: NoteEntityService,
		private readonly cacheService: CacheService,
	) {
		super(id, connection, noteEntityService);
	}

	@bindThis
	public async init(): Promise<boolean> {
		if (!this.user) return false;

		this.subscriber.on(`mainStream:${this.user.id}`, this.onEvent);

		return true;
	}

	@bindThis
	private async onEvent(data: MainEventPayload): Promise<void> {
		switch (data.type) {
			case 'notification': {
				// Ignore notifications from instances the user has muted
				if (isUserFromMutedInstance(data.body, this.userMutedInstances)) return;
				if (data.body.userId) {
					const relation = await this.cacheService.getUserRelation(this.user!.id, data.body.userId);
					if (relation.isMuting) return;
				}

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
		this.subscriber.off(`mainStream:${this.user?.id}`, this.onEvent);
	}
}

@Injectable()
export class MainChannelService implements MiChannelService<true> {
	public readonly shouldShare = MainChannel.shouldShare;
	public readonly requireCredential = MainChannel.requireCredential;
	public readonly kind = MainChannel.kind;

	constructor(
		private noteEntityService: NoteEntityService,
		private readonly cacheService: CacheService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): MainChannel {
		return new MainChannel(
			id,
			connection,
			this.noteEntityService,
			this.cacheService,
		);
	}
}
