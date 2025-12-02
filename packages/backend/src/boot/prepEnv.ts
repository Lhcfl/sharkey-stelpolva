/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'node:events';
import { inspect } from 'node:util';
import { coreLogger } from '@/boot/coreLogger.js';
import { renderInlineError } from '@/misc/render-inline-error.js';

// Polyfill reflection metadata *without* loading dependencies that may corrupt native types.
// https://github.com/microsoft/reflect-metadata?tab=readme-ov-file#es-modules-in-nodejsbrowser-typescriptbabel-bundlers
import 'reflect-metadata/lite';

/**
 * Configures Node.JS global runtime options for values appropriate for Sharkey.
 */
export function prepEnv() {
	// Increase maximum stack trace length.
	// This helps diagnose infinite recursion bugs.
	Error.stackTraceLimit = Infinity;

	// Avoid warnings like "11 message listeners added to [Commander]. MaxListeners is 10."
	// This is expected due to use of NestJS lifecycle hooks.
	EventEmitter.defaultMaxListeners = 128;

	// Workaround certain 3rd-party bugs
	process.on('uncaughtException', (err) => {
		// Workaround for https://github.com/node-fetch/node-fetch/issues/954
		if (String(err).match(/^TypeError: .+ is an? url with embedded credentials.$/)) {
			coreLogger.debug('Suppressed node-fetch issue#954, but the current job may fail.');
			return;
		}

		// Workaround for https://github.com/node-fetch/node-fetch/issues/1845
		if (String(err) === 'TypeError: Cannot read properties of undefined (reading \'body\')') {
			coreLogger.debug('Suppressed node-fetch issue#1845, but the current job may fail.');
			return;
		}

		// Throw all other errors to avoid inconsistent state.
		// (per NodeJS docs, it's unsafe to suppress arbitrary errors in an uncaughtException handler.)
		coreLogger.error(`Uncaught exception: ${renderInlineError(err)}`, {
			error: inspect(err),
		});
		throw err;
	});

	// Log uncaught promise rejections
	process.on('unhandledRejection', (error, promise) => {
		coreLogger.error(`Unhandled rejection: ${renderInlineError(error)}`, {
			error: inspect(error),
			promise: inspect(promise),
		});
	});
}
