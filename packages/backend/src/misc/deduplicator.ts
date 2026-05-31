/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { bindThis } from '@/decorators.js';
import { promiseTry } from '@/misc/promise-try.js';

export class Deduplicator<T> {
	private readonly fetched = new Map<string, { result: T } | { error: unknown } | { promise: Promise<T> }>();

	constructor(
		private readonly fetcher: (key: string) => Promise<T>,

		stock?: Iterable<[key: string, value: T]>,
	) {
		if (stock) {
			for (const [key, result] of stock) {
				this.fetched.set(key, { result });
			}
		}
	}

	@bindThis
	public async fetch(key: string): Promise<T> {
		let job = this.fetched.get(key);

		// If there's not an existing result or task, then start a new one.
		if (job == null) {
			const promise = promiseTry(this.fetcher, key);

			// Bind these separately to avoid messing with the result
			promise
				.then(result => this.fetched.set(key, { result }))
				.catch(error => this.fetched.set(key, { error }));

			job = { promise };
			this.fetched.set(key, job);
		}

		if ('promise' in job) {
			return await job.promise;
		}

		if ('error' in job) {
			throw job.error;
		}

		return job.result;
	}
}
