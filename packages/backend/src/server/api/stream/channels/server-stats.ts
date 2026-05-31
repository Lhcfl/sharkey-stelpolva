/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import { isJsonObject } from '@/misc/json-value.js';
import type { JsonValue } from '@/misc/json-value.js';
import { InternalEventService, type InternalEventTypes } from '@/global/InternalEventService.js';
import { ServerStatsService, ServerStatsLogSize } from '@/core/ServerStatsService.js';
import Channel, { type MiChannelService } from '../channel.js';

class ServerStatsChannel extends Channel {
	public readonly chName = 'serverStats';
	public static shouldShare = true;
	public static requireCredential = false as const;

	constructor(
		private readonly internalEventService: InternalEventService,
		private readonly serverStatsService: ServerStatsService,

		id: string,
		connection: Channel['connection'],
	) {
		super(id, connection);
	}

	@bindThis
	public init(): void {
		this.internalEventService.on('pushServerStats', this.onServerStats);
	}

	@bindThis
	private async onServerStats(stats: InternalEventTypes['pushServerStats']): Promise<void> {
		await this.send('stats', stats);
	}

	@bindThis
	public async onMessage(type: string, body: JsonValue): Promise<void> {
		if (type === 'requestLog') {
			const length = isJsonObject(body) && 'length' in body && typeof(body.length) === 'number'
				? Math.min(Math.max(0, body.length), ServerStatsLogSize)
				: ServerStatsLogSize;

			const log = this.serverStatsService.getLog(length);
			await this.send('statsLog', log);
		}
	}

	@bindThis
	public dispose() {
		this.internalEventService.off('pushServerStats', this.onServerStats);
	}
}

@Injectable()
export class ServerStatsChannelService implements MiChannelService<false> {
	public readonly shouldShare = ServerStatsChannel.shouldShare;
	public readonly requireCredential = ServerStatsChannel.requireCredential;
	public readonly kind = ServerStatsChannel.kind;

	public constructor(
		private readonly internalEventService: InternalEventService,
		private readonly serverStatsService: ServerStatsService,
	) {}

	@bindThis
	public create(id: string, connection: Channel['connection']): ServerStatsChannel {
		return new ServerStatsChannel(
			this.internalEventService,
			this.serverStatsService,
			id,
			connection,
		);
	}
}
