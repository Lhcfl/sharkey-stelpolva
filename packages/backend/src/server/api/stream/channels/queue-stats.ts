/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import { isJsonObject } from '@/misc/json-value.js';
import type { JsonValue } from '@/misc/json-value.js';
import { InternalEventService, type InternalEventTypes } from '@/global/InternalEventService.js';
import { QueueStatsService, QueueStatsLogSize } from '@/core/QueueStatsService.js';
import { Channel, type MiChannelService } from '../channel.js';

// TODO require auth

class QueueStatsChannel extends Channel {
	public readonly chName = 'queueStats';
	public static shouldShare = true as const;
	public static requireCredential = false as const;

	constructor(
		private readonly internalEventService: InternalEventService,
		private readonly queueStatsService: QueueStatsService,

		id: string,
		connection: Channel['connection'],
	) {
		super(id, connection);
	}

	@bindThis
	public init(): void {
		this.internalEventService.on('pushQueueCounts', this.onQueueCounts);
	}

	@bindThis
	private async onQueueCounts(stats: InternalEventTypes['pushQueueCounts']): Promise<void> {
		await this.send('stats', stats);
	}

	@bindThis
	public async onMessage(type: string, body: JsonValue): Promise<void> {
		if (type === 'requestLog') {
			const length = isJsonObject(body) && 'length' in body && typeof(body.length) === 'number'
				? Math.min(Math.max(0, body.length), QueueStatsLogSize)
				: QueueStatsLogSize;

			const log = this.queueStatsService.getLog(length);
			await this.send('statsLog', log);
		}
	}

	@bindThis
	public dispose() {
		this.internalEventService.off('pushQueueCounts', this.onQueueCounts);
	}
}

@Injectable()
export class QueueStatsChannelService implements MiChannelService<false> {
	public readonly shouldShare = QueueStatsChannel.shouldShare;
	public readonly requireCredential = QueueStatsChannel.requireCredential;
	public readonly kind = QueueStatsChannel.kind;

	public constructor(
		private readonly internalEventService: InternalEventService,
		private readonly queueStatsService: QueueStatsService,
	) {}

	@bindThis
	public create(id: string, connection: Channel['connection']): QueueStatsChannel {
		return new QueueStatsChannel(
			this.internalEventService,
			this.queueStatsService,
			id,
			connection,
		);
	}
}
