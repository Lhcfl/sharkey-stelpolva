/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { promiseTry } from '@/misc/promise-try.js';

/**
 * Calls a group of synchronous functions with the given parameters.
 * Errors are suppressed and aggregated, ensuring that nothing is thrown until all calls have completed.
 * This ensures that an error in one callback does not prevent later callbacks from completing.
 * @param funcs Callback functions to execute
 * @param args Arguments to pass to each callback
 */
export function callAll<T extends unknown[]>(funcs: Iterable<(...args: T) => void>, ...args: T): void {
	const errors: unknown[] = [];

	for (const func of funcs) {
		try {
			func(...args);
		} catch (err) {
			errors.push(err);
		}
	}

	if (errors.length > 0) {
		throw new AggregateError(errors);
	}
}

/**
 * Calls a group of async functions with the given parameters.
 * Errors are suppressed and aggregated, ensuring that nothing is thrown until all calls have completed.
 * This ensures that an error in one callback does not prevent later callbacks from completing.
 * Callbacks are executed in parallel using Promise.allSettled().
 * @param funcs Callback functions to execute
 * @param args Arguments to pass to each callback
 */
export async function callAllAsync<T extends unknown[]>(funcs: Iterable<(...args: T) => Promise<void> | void>, ...args: T): Promise<void> {
	// Start all the tasks
	const promises = Array.from(funcs)
		.map(func => {
			// Handle errors thrown synchronously
			return promiseTry(() => func(...args));
		});

	// Wait for all to finish
	const results = await Promise.allSettled(promises);

	// Check for errors
	const errors = results.filter(r => r.status === 'rejected').map(r => r.reason as unknown);
	if (errors.length > 0) {
		throw new AggregateError(errors);
	}
}

/**
 * Calls a single synchronous method across a group of object, passing the given parameters as values.
 * Errors are suppressed and aggregated, ensuring that nothing is thrown until all calls have completed.
 * This ensures that an error in one callback does not prevent later callbacks from completing.
 * @param objects Objects to execute methods on
 * @param method Name (property key) of the method to execute
 * @param args Arguments to pass
 */
export function callAllOn<TObject, TMethod extends MethodKeys<TObject>>(objects: Iterable<TObject>, method: TMethod, ...args: MethodParams<TObject, TMethod>): void {
	const errors: unknown[] = [];

	for (const object of objects) {
		try {
			// @ts-expect-error Our generic constraints ensure this is safe, but TS can't infer that much context.
			object[method](...args);
		} catch (err) {
			errors.push(err);
		}
	}

	if (errors.length > 0) {
		throw new AggregateError(errors);
	}
}

/**
 * Calls a single asynchronous method across a group of object, passing the given parameters as values.
 * Errors are suppressed and aggregated, ensuring that nothing is thrown until all calls have completed.
 * This ensures that an error in one callback does not prevent later callbacks from completing.
 * Callbacks are executed in parallel using Promise.allSettled().
 * @param objects Objects to execute methods on
 * @param method Name (property key) of the method to execute
 * @param args Arguments to pass
 */
export async function callAllOnAsync<TObject, TMethod extends MethodKeys<TObject>>(objects: Iterable<TObject>, method: TMethod, ...args: MethodParams<TObject, TMethod>): Promise<void> {
	// Start all the tasks
	const promises = Array.from(objects)
		.map(object => {
			// Handle errors thrown synchronously
			return promiseTry(() => {
				// @ts-expect-error Our generic constraints ensure this is safe, but TS can't infer that much context.
				return object[method](...args);
			});
		});

	// Wait for all to finish
	const results = await Promise.allSettled(promises);

	// Check for errors
	const errors = results.filter(r => r.status === 'rejected').map(r => r.reason as unknown);
	if (errors.length > 0) {
		throw new AggregateError(errors);
	}
}

type AnyFunc = (...args: unknown[]) => unknown;
type Methods<TObject> = {
	[Key in keyof TObject]: TObject[Key] extends AnyFunc ? TObject[Key] : never;
};
type MethodKeys<TObject> = keyof Methods<TObject>;
type MethodParams<TObject, TMethod extends MethodKeys<TObject>> = TObject[TMethod] extends AnyFunc ? Parameters<TObject[TMethod]> : never;
