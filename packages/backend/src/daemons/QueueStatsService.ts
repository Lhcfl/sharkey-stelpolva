/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import Xev from 'xev';
import * as Bull from 'bullmq';
import { QueueService } from '@/core/QueueService.js';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { QUEUE, baseQueueOptions } from '@/queue/const.js';
import type { OnApplicationShutdown } from '@nestjs/common';

export interface StatsEntry {
	activeSincePrevTick: number,
	active: number,
	waiting: number,
	delayed: number,
}

export interface Stats {
	deliver: StatsEntry,
	inbox: StatsEntry,
}

const ev = new Xev();

const interval = 10000;

@Injectable()
export class QueueStatsService implements OnApplicationShutdown {
	private intervalId?: NodeJS.Timeout;
	private activeDeliverJobs = 0;
	private activeInboxJobs = 0;

	private deliverQueueEvents?: Bull.QueueEvents;
	private inboxQueueEvents?: Bull.QueueEvents;

	private log?: Stats[];

	constructor(
		@Inject(DI.config)
		private config: Config,

		private queueService: QueueService,
	) {
	}

	@bindThis
	private onDeliverActive() {
		this.activeDeliverJobs++;
	}

	@bindThis
	private onInboxActive() {
		this.activeInboxJobs++;
	}

	@bindThis
	private onRequestQueueStatsLog(x: { id: string, length?: number }) {
		if (this.log) {
			ev.emit(`queueStatsLog:${x.id}`, this.log.slice(0, x.length ?? 50));
		}
	}

	/**
	 * Report queue stats regularly
	 */
	@bindThis
	public async start() {
		// Just in case start gets called repeatedly
		await this.stop();

		this.log = [];
		ev.on('requestQueueStatsLog', this.onRequestQueueStatsLog);

		this.deliverQueueEvents = new Bull.QueueEvents(QUEUE.DELIVER, baseQueueOptions(this.config, QUEUE.DELIVER));
		this.inboxQueueEvents = new Bull.QueueEvents(QUEUE.INBOX, baseQueueOptions(this.config, QUEUE.INBOX));

		this.deliverQueueEvents.on('active', this.onDeliverActive);
		this.inboxQueueEvents.on('active', this.onInboxActive);

		const tick = async () => {
			const deliverJobCounts = await this.queueService.deliverQueue.getJobCounts();
			const inboxJobCounts = await this.queueService.inboxQueue.getJobCounts();

			const stats = {
				deliver: {
					activeSincePrevTick: this.activeDeliverJobs,
					active: deliverJobCounts.active,
					waiting: deliverJobCounts.waiting,
					delayed: deliverJobCounts.delayed,
				},
				inbox: {
					activeSincePrevTick: this.activeInboxJobs,
					active: inboxJobCounts.active,
					waiting: inboxJobCounts.waiting,
					delayed: inboxJobCounts.delayed,
				},
			};

			ev.emit('queueStats', stats);

			if (this.log) {
				this.log.unshift(stats);
				if (this.log.length > 200) this.log.pop();
			}

			this.activeDeliverJobs = 0;
			this.activeInboxJobs = 0;
		};

		tick();

		this.intervalId = setInterval(tick, interval);
	}

	@bindThis
	public async stop() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
		}

		this.log = undefined;
		ev.off('requestQueueStatsLog', this.onRequestQueueStatsLog);

		this.deliverQueueEvents?.off('active', this.onDeliverActive);
		this.inboxQueueEvents?.off('active', this.onInboxActive);

		await this.deliverQueueEvents?.close();
		await this.inboxQueueEvents?.close();

		this.activeDeliverJobs = 0;
		this.activeInboxJobs = 0;
	}

	@bindThis
	public async dispose() {
		await this.stop();
		ev.dispose();
	}

	@bindThis
	public async onApplicationShutdown(signal?: string | undefined) {
		await this.dispose();
	}
}
