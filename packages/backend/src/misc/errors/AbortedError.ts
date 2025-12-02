/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { renderInlineError } from '@/misc/render-inline-error.js';

/**
 * Throw when an operation is unexpectedly aborted.
 */
export class AbortedError extends Error {
	// Fix the error name in stack traces - https://stackoverflow.com/a/71573071
	override name = this.constructor.name;

	constructor(signal: AbortSignal, message?: string, options?: Omit<ErrorOptions, 'cause'>) {
		super(
			`Operation aborted: ${message ?? renderInlineError(signal.reason)}`,
			{
				...(options ?? {}),
				cause: signal.reason,
			},
		);
	}
}
