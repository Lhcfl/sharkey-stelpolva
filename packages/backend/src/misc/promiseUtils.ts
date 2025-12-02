/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { throwIfAborted } from '@/misc/throw-if-aborted.js';
import { AbortedError } from '@/misc/errors/AbortedError.js';

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
	// Execute the task first
	let executionResult: Result<T>;
	try {
		const result = typeof(promiseOrCallback) === 'function'
			? await promiseOrCallback()
			: await promiseOrCallback;
		executionResult = { success: true, result };
	} catch (error) {
		executionResult = { success: false, error };
	}

	// Run cleanup next, even if execution failed
	let cleanupResult: Result<void>;
	try {
		const result = await cleanup();
		cleanupResult = { success: true, result };
	} catch (error) {
		cleanupResult = { success: false, error };
	}

	if (!executionResult.success) {
		if (!cleanupResult.success) {
			// Execution and cleanup failed
			throw new AggregateError([executionResult.error, cleanupResult.error]);
		} else {
			// Execution failed, but cleanup succeeded
			throw executionResult.error;
		}
	}

	// Execution succeeded, but cleanup failed
	if (!cleanupResult.success) {
		throw cleanupResult.error;
	}

	// Execution and cleanup succeeded
	return executionResult.result;
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

type Result<T> =
	{ success: true, result: T } |
	{ success: false, error: unknown };

type MaybeCallback<T> = T | (() => T);
type MaybePromise<T> = T | Promise<T>;
