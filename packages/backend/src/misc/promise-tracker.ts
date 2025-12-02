/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { coreLogger } from '@/boot/coreLogger.js';

const backgroundLogger = coreLogger.createSubLogger('background');
const promiseRefs: Set<WeakRef<Promise<unknown>>> = new Set();

export function trackTask<T>(task: () => Promise<T>): Promise<T> {
	const promise = task();
	return trackPromise(promise);
}

/**
 * This tracks promises that other modules decided not to wait for,
 * and makes sure they are all settled before fully closing down the server.
 * Returns the promise for chaining.
 */
export function trackPromise<T>(promise: Promise<T>): Promise<T> {
	const ref = new WeakRef(promise);
	promiseRefs.add(ref);
	promise
		.catch(err => backgroundLogger.error('Unhandled error in tracked background task:', { err }))
		.finally(() => promiseRefs.delete(ref));
	return promise;
}

export async function allSettled(): Promise<void> {
	await Promise.allSettled([...promiseRefs].map(r => r.deref()));
}
