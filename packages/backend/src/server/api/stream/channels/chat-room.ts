/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import type { JsonObject } from '@/misc/json-value.js';
import { ChatService } from '@/core/ChatService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { errorCodes, IdentifiableError } from '@/misc/identifiable-error.js';
import type { ChatRoomsRepository } from '@/models/_.js';
import { Channel, type MiChannelService } from '../channel.js';

class ChatRoomChannel extends Channel {
	public readonly chName = 'chatRoom';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:chat';
	private roomId: string;

	constructor(
		id: string,
		connection: Channel['connection'],

		private chatRoomsRepository: ChatRoomsRepository,
		private chatService: ChatService,
	) {
		super(id, connection);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (!this.subscriber) throw new IdentifiableError(errorCodes.websocketError, `Cannot init ${this.chName} channel: socket is not connected`);
		if (typeof params.roomId !== 'string') return false;

		this.roomId = params.roomId;

		const exists = await this.chatRoomsRepository.findOne({
			select: { id: true },
			where: { id: this.roomId },
		}) != null;

		if (!exists) return true;

		this.subscriber.on(`chatRoomStream:${this.roomId}`, this.onEvent);

		return true;
	}

	@bindThis
	private async onEvent(data: GlobalEvents['chatRoom']['payload']) {
		this.send(data.type, data.body);
	}

	@bindThis
	public onMessage(type: string, body: any) {
		switch (type) {
			case 'read':
				if (this.roomId) {
					this.chatService.readRoomChatMessage(this.user!.id, this.roomId);
				}
				break;
		}
	}

	@bindThis
	public dispose() {
		this.subscriber?.off(`chatRoomStream:${this.roomId}`, this.onEvent);
	}
}

@Injectable()
export class ChatRoomChannelService implements MiChannelService<true> {
	public readonly shouldShare = ChatRoomChannel.shouldShare;
	public readonly requireCredential = ChatRoomChannel.requireCredential;
	public readonly kind = ChatRoomChannel.kind;

	constructor(
		@Inject(DI.chatRoomsRepository)
		private readonly chatRoomsRepository: ChatRoomsRepository,

		private readonly chatService: ChatService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): ChatRoomChannel {
		return new ChatRoomChannel(
			id,
			connection,
			this.chatRoomsRepository,
			this.chatService,
		);
	}
}
