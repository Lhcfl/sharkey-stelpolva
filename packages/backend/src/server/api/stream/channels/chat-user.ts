/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { ChatMessagesRepository } from '@/models/_.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import type { JsonObject } from '@/misc/json-value.js';
import { ChatService } from '@/core/ChatService.js';
import { errorCodes, IdentifiableError } from '@/misc/identifiable-error.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { Channel, type MiChannelService } from '../channel.js';

class ChatUserChannel extends Channel {
	public readonly chName = 'chatUser';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:chat';
	private otherId: string;

	constructor(
		id: string,
		connection: Channel['connection'],

		private chatMessagesRepository: ChatMessagesRepository,
		private chatService: ChatService,
	) {
		super(id, connection);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (!this.user) return false;
		if (!this.subscriber) throw new IdentifiableError(errorCodes.websocketError, `Cannot init ${this.chName} channel: socket is not connected`);
		if (typeof params.otherId !== 'string') return false;
		this.otherId = params.otherId;

		const exists = (await this.chatMessagesRepository.findOne({
			select: { id: true },
			where: {
				fromUserId: this.user.id,
				toUserId: this.otherId,
			},
		})) != null;

		if (!exists) return false;

		this.subscriber.on(`chatUserStream:${this.user.id}-${this.otherId}`, this.onEvent);

		return true;
	}

	@bindThis
	private async onEvent(data: GlobalEvents['chatUser']['payload']) {
		this.send(data.type, data.body);
	}

	@bindThis
	public onMessage(type: string, body: any) {
		switch (type) {
			case 'read':
				if (this.otherId) {
					this.chatService.readUserChatMessage(this.user!.id, this.otherId);
				}
				break;
		}
	}

	@bindThis
	public dispose() {
		this.subscriber?.off(`chatUserStream:${this.user!.id}-${this.otherId}`, this.onEvent);
	}
}

@Injectable()
export class ChatUserChannelService implements MiChannelService<true> {
	public readonly shouldShare = ChatUserChannel.shouldShare;
	public readonly requireCredential = ChatUserChannel.requireCredential;
	public readonly kind = ChatUserChannel.kind;

	constructor(
		@Inject(DI.chatMessagesRepository)
		private readonly chatMessagesRepository: ChatMessagesRepository,

		private chatService: ChatService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): ChatUserChannel {
		return new ChatUserChannel(
			id,
			connection,
			this.chatMessagesRepository,
			this.chatService,
		);
	}
}
