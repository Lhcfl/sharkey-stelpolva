/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import { errorCodes, IdentifiableError } from '@/misc/identifiable-error.js';
import type { JsonObject } from '@/misc/json-value.js';
import { Channel, type MiChannelService } from '../channel.js';

class ReversiChannel extends Channel {
	public readonly chName = 'reversi';
	public static shouldShare = true;
	public static requireCredential = true as const;
	public static kind = 'read:account';

	constructor(
		id: string,
		connection: Channel['connection'],
	) {
		super(id, connection);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (!this.user) return false;
		if (!this.subscriber) throw new IdentifiableError(errorCodes.websocketError, `Cannot init ${this.chName} channel: socket is not connected`);
		this.subscriber.on(`reversiStream:${this.user.id}`, this.send);
		return true;
	}

	@bindThis
	public dispose() {
		this.subscriber?.off(`reversiStream:${this.user?.id}`, this.send);
	}
}

@Injectable()
export class ReversiChannelService implements MiChannelService<true> {
	public readonly shouldShare = ReversiChannel.shouldShare;
	public readonly requireCredential = ReversiChannel.requireCredential;
	public readonly kind = ReversiChannel.kind;

	@bindThis
	public create(id: string, connection: Channel['connection']): ReversiChannel {
		return new ReversiChannel(
			id,
			connection,
		);
	}
}
