/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setTimeout } from 'node:timers/promises';
import promiseLimit from 'promise-limit';
import { promiseMap } from '@/misc/promise-map.js';

async function randomDelay() {
	await setTimeout(10 * Math.abs(Math.random()));
}

describe(promiseMap, () => {
	it('should return empty array with no input', async () => {
		const result = await promiseMap([] as string[], async () => 'wrong');
		expect(result).toHaveLength(0);
	});

	it('should map items in correct order', async () => {
		const items = [1, 2, 3, 4, 5];

		const results = await promiseMap(items, async i => {
			await randomDelay();
			return String(i);
		});

		expect(results).toEqual(['1', '2', '3', '4', '5']);
	});

	it('should accept async iterable input', async () => {
		async function *generator() {
			yield 1;
			yield 2;
			yield 3;
		}

		const results = await promiseMap(generator(), async i => String(i));

		expect(results).toEqual(['1', '2', '3']);
	});

	it('should accept limit input', async () => {
		const items = [1, 2, 3, 4, 5];

		let inProgress = 0;
		let maxProgress = 0;

		const results = await promiseMap(items, async i => {
			inProgress++;
			maxProgress = Math.max(maxProgress, inProgress);

			await randomDelay();

			inProgress--;
			return String(i);
		}, {
			limit: 2,
		});

		expect(results).toEqual(['1', '2', '3', '4', '5']);
		expect(maxProgress).toEqual(2);
	});

	it('should accept limit as instance', async () => {
		const items = [1, 2, 3, 4, 5];
		const limit = promiseLimit<void>(2);

		let inProgress = 0;
		let maxProgress = 0;

		const results = await promiseMap(items, async i => {
			inProgress++;
			maxProgress = Math.max(maxProgress, inProgress);

			await randomDelay();

			inProgress--;
			return String(i);
		}, {
			limit,
		});

		expect(results).toEqual(['1', '2', '3', '4', '5']);
		expect(maxProgress).toEqual(2);
	});

	it('should reject when signal aborts', async () => {
		const items = [1, 2, 3, 4, 5];
		const controller = new AbortController();

		const promise = promiseMap(items, async i => {
			if (i === 3) {
				controller.abort(new Error('test abort'));
			}

			return String(i);
		}, {
			limit: 1,
			signal: controller.signal,
		});

		await expect(promise).rejects.toThrow('abort');
	});

	it('should abort when signal aborts', async () => {
		const items = [1, 2, 3, 4, 5];
		const controller = new AbortController();

		const processed: number[] = [];

		await promiseMap(items, async i => {
			if (i === 3) {
				controller.abort('test abort');
			}

			processed.push(i);
			return String(i);
		}, {
			limit: 1,
			signal: controller.signal,
		}).catch(() => null);

		expect(processed).toEqual([1, 2, 3]);
	});

	it('should reject when promise rejects', async () => {
		const items = [1, 2, 3, 4, 5];

		const promise = promiseMap(items, async i => {
			if (i === 3) {
				throw new Error('test error');
			}

			return String(i);
		});

		await expect(promise).rejects.toThrow('test');
	});

	it('should abort when promise rejects', async () => {
		const items = [1, 2, 3, 4, 5];

		const processed: number[] = [];

		await promiseMap(items, async i => {
			if (i === 3) {
				throw new Error('test error');
			}

			processed.push(i);

			return String(i);
		}).catch(() => null);

		expect(processed).toEqual([1, 2]);
	});

	it('should aggregate all errors', async () => {
		const items = [1, 2, 3, 4, 5];

		const promise = promiseMap(items, async i => {
			await setTimeout(10);

			throw new Error(`test error: ${i}`);
		});

		await expect(promise).rejects.toThrow(AggregateError);
	});
});
