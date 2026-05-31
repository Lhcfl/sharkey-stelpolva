/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { throwIfAborted } from '@/misc/throw-if-aborted.js';
import { AbortedError } from '@/misc/errors/AbortedError.js';
import type { Result } from '@/types.js';

/**
 * Executes a task or promise, then runs a provided cleanup task.
 * The resulting task resolves only when *both* steps are complete.
 * One or both of the steps may throw, but the other will always run anyway.
 * All errors are captured, aggregated, and re-thrown by the final promise.
 *
 * @param promiseOrCallback Promise or async callback to execute
 * @param cleanup Cleanup callback to execute after execution completes or fails
 */
export async function withCleanup<T>(promiseOrCallback: MaybeCallback<Promise<T>>, cleanup: () => MaybePromise<void>): Promise<T> {
	// Execute task and defer errors
	const executionResult = await toResult(promiseOrCallback);

	// Execute cleanup and defer errors
	const cleanupResult = await toResult(cleanup);

	if ('error' in executionResult && 'error' in cleanupResult) {
		// Execution and cleanup both failed
		throw new AggregateError([executionResult.error, cleanupResult.error]);
	} else if ('error' in executionResult) {
		// Execution failed, but cleanup succeeded
		throw executionResult.error;
	} else if ('error' in cleanupResult) {
		// Execution succeeded, but cleanup failed
		throw cleanupResult.error;
	} else {
		// Execution and cleanup both succeeded
		return executionResult.result;
	}
}

async function toResult<T>(promiseOrCallback: Promise<T> | (() => MaybePromise<T>)): Promise<Result<T>> {
	try {
		if (typeof(promiseOrCallback) === 'function') {
			return { result: await promiseOrCallback() };
		} else {
			return { result: await promiseOrCallback };
		}
	} catch (error) {
		return { error };
	}
}

/**
 * Binds an AbortSignal to a Promise.
 * The returned promise will resolve or reject with the result of the provided promise, unless the signal is aborted first.
 *
 * The promise must be provided as an async factory, which will be called to produce the actual task promise.
 * This requirement is in place to ensure consistent behavior if the abortSignal is already aborted.
 * Otherwise, the input promise may produce an UnhandledPromiseRejection error that crashes the app.
 * @param factory Callback to start the promise
 * @param abortSignal Signal to terminate the promise
 */ // TODO accept a promise directly here
export async function withSignal<T>(factory: () => Promise<T>, abortSignal: AbortSignal): Promise<T> {
	// If already aborted, then don't do anything.
	throwIfAborted(abortSignal);

	// Create a promise with controls.
	const { promise, resolve, reject } = Promise.withResolvers<T>();
	const abort = () => reject(new AbortedError(abortSignal));

	// Bind the abort signal.
	abortSignal.addEventListener('abort', abort);
	promise
		.finally(() => abortSignal.removeEventListener('abort', abort))
		.catch(() => null); // Make sure it's never an unhandled rejection!

	// Bind the task promise.
	const taskPromise = factory();
	taskPromise
		.then(result => resolve(result), err => reject(err))
		.catch(() => null); // Make sure it's never an unhandled rejection!

	return promise;
}

type MaybeCallback<T> = T | (() => T);
type MaybePromise<T> = T | Promise<T>;
