/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { AbortedError } from '@/misc/errors/AbortedError.js';

export function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) {
		throw new AbortedError(signal);
	}
}

export function rejectIfAborted(signal: AbortSignal): Promise<void> {
	if (signal.aborted) {
		return Promise.reject(new AbortedError(signal));
	} else {
		return Promise.resolve();
	}
}
