/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { InternalEventService } from '@/global/InternalEventService.js';
import { QueueService } from '@/core/QueueService.js';
import { QUEUE_TYPES } from '@/queue/const.js';
import { bindThis } from '@/decorators.js';
import type { QueueType } from '@/queue/types.js';
import type * as Misskey from 'misskey-js';

export const QueueStatsLogSize = 200;

@Injectable()
export class QueueStatsService implements OnApplicationShutdown, OnApplicationBootstrap {
	private readonly log: Misskey.entities.QueueLogs[] = [];
	private readonly activeCallbacks = {} as Record<QueueType, () => void>;
	private readonly activeCounters = {} as Record<QueueType, number>;

	public constructor(
		private readonly internalEventService: InternalEventService,
		private readonly queueService: QueueService,
	) {
		for (const qt of QUEUE_TYPES) {
			this.activeCallbacks[qt] = () => this.onQueueActive(qt);
			this.activeCounters[qt] = 0;
		}
	}

	@bindThis
	public getLog(length: number): Misskey.entities.QueueCounts[] {
		return this.log.slice(0, length);
	}

	@bindThis
	public async tick(): Promise<void> {
		// Create new snapshot
		const counts = await this.snapshot();

		// Emit event (this will immediately sync logs)
		await this.internalEventService.emit('pushQueueCounts', counts);
	}

	@bindThis
	private async snapshot(): Promise<Misskey.entities.QueueLogs> {
		// Create new snapshot
		const counts = await this.queueService.queueGetCounts();

		// Add activeSincePrevTick
		for (const key of QUEUE_TYPES) {
			counts[key].activeSincePrevTick = this.activeCounters[key];
			this.activeCounters[key] = 0;
		}

		return counts as Misskey.entities.QueueLogs;
	}

	@bindThis
	private onQueueCounts(counts: Misskey.entities.QueueLogs): void {
		this.log.unshift(counts);

		while (this.log.length > QueueStatsLogSize) {
			this.log.pop();
		}
	}

	@bindThis
	private onQueueActive(queueType: QueueType): void {
		this.activeCounters[queueType]++;
	}

	@bindThis
	public onApplicationBootstrap() {
		this.internalEventService.on('pushQueueCounts', this.onQueueCounts);
		for (const qt of QUEUE_TYPES) {
			this.queueService.getQueueEvents(qt).on('active', this.activeCallbacks[qt]);
		}
	}

	@bindThis
	public onApplicationShutdown() {
		this.internalEventService.off('pushQueueCounts', this.onQueueCounts);
		for (const qt of QUEUE_TYPES) {
			this.queueService.getQueueEvents(qt).off('active', this.activeCallbacks[qt]);
		}
	}
}
