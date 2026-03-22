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

class DriveChannel extends Channel {
	public readonly chName = 'drive';
	public static shouldShare = true;
	public static requireCredential = true as const;
	public static kind = 'read:account';

	@bindThis
	public async init(): Promise<boolean> {
		if (!this.user) return false;
		if (!this.subscriber) throw new IdentifiableError(errorCodes.websocketError, `Cannot init ${this.chName} channel: socket is not connected`);
		// Subscribe drive stream
		this.subscriber.on(`driveStream:${this.user.id}`, this.onEvent);
		return true;
	}

	@bindThis
	private onEvent(data: GlobalEvents['drive']['payload']) {
		this.send(data);
	}

	@bindThis
	public dispose() {
		this.subscriber?.off(`driveStream:${this.user?.id}`, this.onEvent);
	}
}

@Injectable()
export class DriveChannelService implements MiChannelService<true> {
	public readonly shouldShare = DriveChannel.shouldShare;
	public readonly requireCredential = DriveChannel.requireCredential;
	public readonly kind = DriveChannel.kind;

	@bindThis
	public create(id: string, connection: Channel['connection']): DriveChannel {
		return new DriveChannel(
			id,
			connection,
		);
	}
}
