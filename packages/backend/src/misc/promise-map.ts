/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import promiseLimit from 'promise-limit';

/**
 * Pipes a stream of values through an async mapping callback to produce a new stream of results.
 * Avoids extra work by bailing out if any promise rejects or the caller stops iterating the stream.
 *
 * Can optionally accept a concurrency limit and/or abort signal to further customize behavior.
 * If a limit is provided, then no more than that many promises will execute at once.
 * If a signal is provided, then all promises will terminate when the signal aborts.
 * A signal cannot be provided without a limit, as that would be a no-op.
 */
export async function promiseMap<Input, Output>(
	values: Iterable<Input> | AsyncIterable<Input>,
	callback: (value: Input, index: number) => Promise<Output>,
	opts?: {
		limit: number | ReturnType<typeof promiseLimit<void>>;
		signal?: AbortSignal;
	},
): Promise<Output[]> {
	// Parse the configured limit or create no-op
	const limiter = createLimiter(opts?.limit);

	// Internal state
	const outputs: Output[] = [];
	const errors: unknown[] = [];
	const queue: Promise<void>[] = [];

	let count = 0;
	for await (const input of values) {
		// Capture the destination index to make sure items are returned in the same order
		const index = count;
		count++;

		// Stop when any promise fails
		if (errors.length > 0) {
			break;
		}

		// Kick off the next item
		const promise = limiter(async () => {
			// Check for rejection without throwing any new errors
			if (errors.length > 0) return;

			try {
				// Checking the abort signal here covers all locations.
				// 1. It bails the callback directly.
				// 2. The error is written to errors, which breaks out of the loop
				opts?.signal?.throwIfAborted();

				// Populate the next value
				outputs[index] = await callback(input, index);
			} catch (err) {
				errors.push(err);
			}
		});

		// But don't forget about it!
		queue.push(promise);
	}

	// Wait for everything to complete
	await Promise.allSettled(queue);

	// Failed - consolidate and throw errors
	if (errors.length > 0) {
		throwResults(errors);
	}

	// Success - return results
	return outputs;
}

type Limiter = (cb: () => Promise<void>) => Promise<void>;

function createLimiter(limit: undefined | number | ReturnType<typeof promiseLimit<void>>): Limiter {
	if (!limit) {
		return cb => cb();
	}

	if (typeof limit === 'number') {
		return promiseLimit<void>(limit);
	}

	return limit;
}

function throwResults(errors: unknown[]): never {
	if (errors.length === 0) {
		// Shouldn't happen
		throw new Error('Mapping promise rejected');
	}

	if (errors.length === 1) {
		if (errors[0] instanceof Error) {
			throw errors[0];
		} else {
			throw new Error('Mapping promise rejected', { cause: errors[0] });
		}
	}

	throw new AggregateError(errors);
}
