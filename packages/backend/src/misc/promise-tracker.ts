/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { coreLogger } from '@/boot/coreLogger.js';

const backgroundLogger = coreLogger.createSubLogger('background');
const promiseRefs: Set<WeakRef<Promise<unknown>>> = new Set();

export function trackTask(task: () => Promise<unknown>): void {
	trackPromise(task());
}

/**
 * This tracks promises that other modules decided not to wait for,
 * and makes sure they are all settled before fully closing down the server.
 */
export function trackPromise(promise: Promise<unknown>) {
	const ref = new WeakRef(promise);
	promiseRefs.add(ref);
	promise
		.catch(err => backgroundLogger.error('Unhandled error in tracked background task:', { err }))
		.finally(() => promiseRefs.delete(ref));
}

export async function allSettled(): Promise<void> {
	await Promise.allSettled([...promiseRefs].map(r => r.deref()));
}
