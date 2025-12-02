/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import promiseLimit from 'promise-limit';
import type { TimeService, TimerHandle } from '@/global/TimeService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { bindThis } from '@/decorators.js';
import { Serialized } from '@/types.js';

type Job<V> = {
	value: V;
	timer: TimerHandle;
};

// TODO document IPC sync process

// sync cross-process:
//  1. Emit internal events when scheduling timer, performing queue, and enqueuing data
//  2. On enqueue, mark ID as deferred.
//  3. On perform, clear mark.
//  4. On performAll, skip deferred IDs.
//  5. On enqueue when ID is deferred, send data as event instead.
//  6. On delete, clear mark.
//  7. On delete when ID is deferred, do nothing.

export class CollapsedQueue<V> {
	private readonly limiter?: ReturnType<typeof promiseLimit<void>>;
	private readonly jobs: Map<string, Job<V>> = new Map();
	private readonly deferredKeys = new Set<string>();

	constructor(
		private readonly internalEventService: InternalEventService,
		private readonly timeService: TimeService,
		public readonly name: string,
		private readonly timeout: number,
		private readonly collapse: (oldValue: V, newValue: V) => V,
		private readonly perform: (key: string, value: V) => Promise<void | unknown>,
		private readonly opts?: {
			onError?: (queue: CollapsedQueue<V>, error: unknown) => void | Promise<void>,
			concurrency?: number,
			redisParser?: (data: Serialized<V>) => V,
		},
	) {
		if (opts?.concurrency) {
			this.limiter = promiseLimit<void>(opts.concurrency);
		}

		this.internalEventService.on('collapsedQueueDefer', this.onDefer, { ignoreLocal: true });
		this.internalEventService.on('collapsedQueueEnqueue', this.onEnqueue, { ignoreLocal: true });
	}

	@bindThis
	async enqueue(key: string, value: V) {
		// If deferred, then send it out to the owning process
		if (this.deferredKeys.has(key)) {
			await this.internalEventService.emit('collapsedQueueEnqueue', { name: this.name, key, value });
			return;
		}

		// If already queued, then merge
		const job = this.jobs.get(key);
		if (job) {
			job.value = this.collapse(job.value, value);
			return;
		}

		// Otherwise, create a new job
		const timer = this.timeService.startTimer(async () => {
			const job = this.jobs.get(key);
			if (!job) return;

			this.jobs.delete(key);
			await this._perform(key, job.value);
		}, this.timeout);
		this.jobs.set(key, { value, timer });

		// Mark as deferred so other processes will forward their state to us
		await this.internalEventService.emit('collapsedQueueDefer', { name: this.name, key, deferred: true });
	}

	@bindThis
	async delete(key: string) {
		const job = this.jobs.get(key);
		if (!job) return;

		this.timeService.stopTimer(job.timer);
		this.jobs.delete(key);
		await this.internalEventService.emit('collapsedQueueDefer', { name: this.name, key, deferred: false });
	}

	@bindThis
	async performAllNow() {
		for (const job of this.jobs.values()) {
			this.timeService.stopTimer(job.timer);
		}

		const entries = Array.from(this.jobs.entries());
		this.jobs.clear();

		return await Promise.all(entries.map(([key, job]) => this._perform(key, job.value)));
	}

	private async _perform(key: string, value: V) {
		try {
			await this.internalEventService.emit('collapsedQueueDefer', { name: this.name, key, deferred: false });

			if (this.limiter) {
				await this.limiter(async () => {
					await this.perform(key, value);
				});
			} else {
				await this.perform(key, value);
			}

			return true;
		} catch (err) {
			await this.opts?.onError?.(this, err);
			return false;
		}
	}

	//#region Events from other processes
	@bindThis
	private async onDefer(data: { name: string, key: string, deferred: boolean }) {
		if (data.name !== this.name) return;

		// Check for and recover from de-sync conditions where multiple processes try to "own" the same job.
		const job = this.jobs.get(data.key);
		if (job) {
			if (data.deferred) {
				// If another process tries to claim our job, then give it to them and queue our latest state.
				this.timeService.stopTimer(job.timer);
				this.jobs.delete(data.key);
				await this.internalEventService.emit('collapsedQueueEnqueue', { name: this.name, key: data.key, value: job.value });
			} else {
				// If another process tries to release our job, then just continue.
				return;
			}
		}

		if (data.deferred) {
			this.deferredKeys.add(data.key);
		} else {
			this.deferredKeys.delete(data.key);
		}
	}

	@bindThis
	private async onEnqueue(data: { name: string, key: string, value: unknown }) {
		if (data.name !== this.name) return;

		// Only enqueue if not deferred
		if (!this.deferredKeys.has(data.key)) {
			const value = this.opts?.redisParser
				? this.opts.redisParser(data.value as Serialized<V>)
				: data.value as V;

			await this.enqueue(data.key, value);
		}
	}
	//#endregion

	async dispose() {
		this.internalEventService.off('collapsedQueueDefer', this.onDefer);
		this.internalEventService.off('collapsedQueueEnqueue', this.onEnqueue);

		return await this.performAllNow();
	}
}
