/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import type { JsonObject } from '@/misc/json-value.js';
import { errorCodes, IdentifiableError } from '@/misc/identifiable-error.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { Channel, type MiChannelService } from '../channel.js';

class AdminChannel extends Channel {
	public readonly chName = 'admin';
	public static shouldShare = true;
	public static requireCredential = true as const;
	public static kind = 'read:admin:stream';

	@bindThis
	public async init(): Promise<boolean> {
		if (!this.user) return false;
		if (!this.subscriber) throw new IdentifiableError(errorCodes.websocketError, `Cannot init ${this.chName} channel: socket is not connected`);

		// Subscribe admin stream
		this.subscriber.on(`adminStream:${this.user.id}`, this.onEvent);

		return true;
	}

	@bindThis
	private onEvent(data: GlobalEvents['admin']['payload']) {
		this.send(data);
	}

	@bindThis
	public dispose() {
		// Unsubscribe events
		this.subscriber?.off(`adminStream:${this.user?.id}`, this.onEvent);
	}
}

@Injectable()
export class AdminChannelService implements MiChannelService<true> {
	public readonly shouldShare = AdminChannel.shouldShare;
	public readonly requireCredential = AdminChannel.requireCredential;
	public readonly kind = AdminChannel.kind;

	@bindThis
	public create(id: string, connection: Channel['connection']): AdminChannel {
		return new AdminChannel(
			id,
			connection,
		);
	}
}
