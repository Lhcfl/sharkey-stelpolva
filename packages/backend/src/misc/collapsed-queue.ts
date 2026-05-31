/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import promiseLimit from 'promise-limit';
import type Logger from '@/logger.js';
import type { TimeService, TimerHandle } from '@/global/TimeService.js';
import { bindThis } from '@/decorators.js';
import { promiseMap, type Limiter } from '@/misc/promise-map.js';
import { renderInlineError } from '@/misc/render-inline-error.js';

type Job<V> = {
	value: V;
	timer: TimerHandle;
};

export interface CollapsedQueueServices {
	timeService: TimeService,
	parentLogger: Logger, // TODO use ParentLogger type when merged
}

export interface CollapsedQueueOpts<V> {
	timeout: number,
	collapse: (oldValue: V, newValue: V) => V,
	perform: (key: string, value: V) => void | Promise<void>,
	check?: (key: string, value: V) => boolean,
	limiter?: number | Limiter,
}

export class CollapsedQueue<V> {
	private readonly limiter: Limiter;
	private readonly jobs = new Map<string, Job<V>>();

	private readonly timeService: TimeService;
	private readonly logger: Logger;
	private readonly timeout: number;
	private readonly collapse: (oldValue: V, newValue: V) => V;
	private readonly perform: (key: string, value: V) => void | Promise<void>;
	private readonly check: undefined | ((key: string, value: V) => boolean);

	constructor(
		public readonly name: string,
		services: CollapsedQueueServices,
		opts: CollapsedQueueOpts<V>,
	) {
		this.timeService = services.timeService;
		this.logger = services.parentLogger.createSubLogger(name);

		this.timeout = opts.timeout;
		this.collapse = opts.collapse;
		this.perform = opts.perform;
		this.check = opts.check;
		this.limiter = typeof(opts.limiter) === 'number'
			? promiseLimit(opts.limiter)
			: (opts.limiter ?? (cb => cb()));
	}

	@bindThis
	public enqueue(key: string, value: V): void {
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
			await this.performSafe(key, job.value);
		}, this.timeout);
		this.jobs.set(key, { value, timer });
	}

	@bindThis
	public delete(key: string): void {
		const job = this.jobs.get(key);
		if (!job) return;

		this.timeService.stopTimer(job.timer);
		this.jobs.delete(key);
	}

	@bindThis
	public async performNow(key: string): Promise<void> {
		const job = this.jobs.get(key);
		if (!job) {
			return;
		}

		this.timeService.stopTimer(job.timer);
		this.jobs.delete(key);

		await this.limiter(async () => {
			await this.performSafe(key, job.value);
		});
	}

	@bindThis
	public async performAllNow(): Promise<void> {
		// Swap the entries to make sure duplicate calls don't conflict
		const entries = this.jobs.entries().toArray();
		this.jobs.clear();

		// TODO use the no-bail logic when merged
		const results = await promiseMap(entries, async ([key, job]) => {
			this.timeService.stopTimer(job.timer);
			return await this.performSafe(key, job.value);
		}, {
			limiter: this.limiter,
		});

		const total = entries.length;
		const successes = results.reduce((sum, result) => sum + (result === true ? 1 : 0), 0);
		const failures = results.reduce((sum, result) => sum + (result === false ? 0 : 1), 0);

		if (successes > 0 || failures > 0) {
			if (failures > 0) {
				this.logger.debug(`Persistence completed: ${successes}/${total} jobs succeeded and ${failures}/${total} failed`);
			} else {
				this.logger.debug(`Persistence completed: ${successes} jobs completed successfully`);
			}
		} else {
			this.logger.debug('Persistence skipped: nothing to do');
		}
	}

	private async performSafe(key: string, value: V): Promise<boolean | 'skip'> {
		try {
			if (this.check != null && !this.check(key, value)) {
				return 'skip';
			}

			await this.perform(key, value);
			return true;
		} catch (err) {
			this.logger.error(`Error persisting ${this.name} queue: ${renderInlineError(err)}`);
			return false;
		}
	}

	@bindThis
	public async dispose(): Promise<void> {
		await this.performAllNow();
	}
}

