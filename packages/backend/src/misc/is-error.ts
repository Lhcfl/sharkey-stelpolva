/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { types } from 'node:util';

const hasDOMException = Reflect.has(globalThis, 'DOMException');
const hasErrorIsError = Reflect.has(globalThis.Error, 'isError');

/**
 * Polyfill for https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/isError
 */
export const isError: IsErrorFunc = hasErrorIsError ? Error.isError : isErrorPolyfill;

/**
 * Returns true if error is an instance of Error, false otherwise.
 * More robust than instanceof.
 */
export type IsErrorFunc = (error: unknown) => error is Error;

export function isErrorPolyfill(error: unknown): error is Error {
	// These are the fastest checks, so run them first
	if (isErrorByInstance(error)) {
		return true;
	}

	// Errors must be a non-null object
	if (typeof(error) !== 'object' || error == null) {
		return false;
	}

	// jest, and maybe a few other edge cases
	// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/species
	if ('constructor' in error && isErrorByInstance(error.constructor[Symbol.species])) {
		return true;
	}

	// If it looks like a duck and quacks like a duck...
	if ('name' in error && typeof(error.name) === 'string') {
		if ('message' in error && typeof(error.message) === 'string') {
			if (!('stack' in error) || typeof(error.stack) === 'string' || typeof(error.stack) === 'undefined') {
				return true;
			}
		}
	}

	// Guess it's not :(
	return false;
}

function isErrorByInstance(error: unknown): boolean {
	// It must be a non-null object
	if (typeof(error) !== 'object' || error == null) {
		return false;
	}

	// An actual instance, nice
	if (error instanceof Error) {
		return true;
	}

	// DOMException is an Error, just without the prototype chain
	if (hasDOMException && error instanceof DOMException) {
		return true;
	}

	// Realm fuckery
	if (types.isNativeError(error)) {
		return true;
	}

	return false;
}

