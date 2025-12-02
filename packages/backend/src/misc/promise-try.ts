/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { types } from 'node:util';

const hasPromiseTry = Reflect.has(globalThis.Promise, 'try');

/**
 * Polyfill for https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/try
 */
export const promiseTry: PromiseTryFunc = hasPromiseTry ? Promise.try : promiseTryPolyfill;

/**
 * Takes a callback of any kind (returns or throws, synchronously or asynchronously) and wraps its result in a Promise.
 */
export type PromiseTryFunc = <T, U extends unknown[]>(callbackFn: (...args: U) => T | PromiseLike<T>, ...args: U) => Promise<Awaited<T>>;

export function promiseTryPolyfill<T, U extends unknown[]>(callbackFn: (...args: U) => T | PromiseLike<T>, ...args: U): Promise<Awaited<T>> {
	try {
		const result = callbackFn(...args);
		if (types.isPromise(result)) {
			// async return or throw
			return result as Promise<Awaited<T>>;
		}
		// sync return
		return Promise.resolve(result);
	}	catch (err) {
		// sync throw
		return Promise.reject(err);
	}
}

