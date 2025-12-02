/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inspect } from 'node:util';
import { isError } from '@/misc/is-error.js';

export function isNotNullish<T>(value: T): NonNullable<T> {
	expect(value).not.toBe(undefined);
	expect(value).not.toBe(null);
	return value as NonNullable<T>;
}

export function throws(callback: SyncCallback): unknown;
export function throws<TError extends AnyConstructor>(errorClass: TError, callback: SyncCallback): InstanceType<TError>;
export function throws<TError extends AnyConstructor>(errorClassOrCallback: TError | (SyncCallback), callbackOrUndefined?: SyncCallback): InstanceType<TError> | unknown {
	const callback = (callbackOrUndefined ?? errorClassOrCallback) as SyncCallback;
	const errorClass = callbackOrUndefined !== undefined ? (errorClassOrCallback as TError) : undefined;

	let result: unknown = undefined;

	try {
		result = callback();
	}	catch (error) {
		assertIsErrorOfType(errorClass, error);
		return error as InstanceType<TError>;
	}

	const callbackName = callback.name || 'callback';
	const errorName = errorClass?.name || 'Error';
	const resultSummary = inspect(result);
	throw new Error(`assert.throws: expected ${callbackName} to throw ${errorName}, but instead it returned: ${resultSummary}`, { cause: result });
}

export async function throwsAsync(callback: AsyncCallback): Promise<unknown>;
export async function throwsAsync<TError extends AnyConstructor>(errorClass: TError, callback: AsyncCallback): Promise<InstanceType<TError>>;
export async function throwsAsync<TError extends AnyConstructor>(errorClassOrCallback: TError | AsyncCallback, callbackOrUndefined?: AsyncCallback): Promise<InstanceType<TError> | unknown> {
	const callback = (callbackOrUndefined ?? errorClassOrCallback) as AsyncCallback;
	const errorClass = callbackOrUndefined !== undefined ? (errorClassOrCallback as TError) : undefined;

	let result: unknown = undefined;

	try {
		result = await callback();
	}	catch (error) {
		assertIsErrorOfType(errorClass, error);
		return error as InstanceType<TError>;
	}

	const callbackName = callback.name || 'callback';
	const errorName = errorClass?.name || 'Error';
	const resultSummary = inspect(result);
	throw new Error(`assert.throwsAsync: expected ${callbackName} to throw ${errorName}, but instead it returned: ${resultSummary}`, { cause: result });
}

export async function rejectsAsync(promise: AnyPromise): Promise<unknown>;
export async function rejectsAsync<TError extends AnyConstructor>(errorClass: TError, promise: AnyPromise): Promise<InstanceType<TError>>;
export async function rejectsAsync<TError extends AnyConstructor>(errorClassOrPromise: TError | AnyPromise, promiseOrUndefined?: AnyPromise): Promise<InstanceType<TError> | unknown> {
	const promise = (promiseOrUndefined ?? errorClassOrPromise) as AnyPromise;
	const errorClass = promiseOrUndefined !== undefined ? (errorClassOrPromise as TError) : undefined;

	let result: unknown = undefined;

	try {
		result = await promise;
	}	catch (error) {
		assertIsErrorOfType(errorClass, error);
		return error as InstanceType<TError>;
	}

	const errorName = errorClass?.name || 'Error';
	const resultSummary = inspect(result);
	throw new Error(`assert.rejectsAsync: expected promise to reject with ${errorName}, but instead it resolved with ${resultSummary}`, { cause: result });
}

function assertIsErrorOfType(errorClass: AnyConstructor | undefined, error: unknown): void {
	if (errorClass === Error) {
		expect(error).toBeDefined();
		expect(isError(error)).toBe(true);
	} else if (errorClass !== undefined) {
		expect(error).toBeDefined();
		expect(error).toBeInstanceOf(errorClass);
	}
}

type AnyConstructor = abstract new(...args: unknown[]) => unknown;
type AnyPromise = Promise<unknown>;
type SyncCallback = () => unknown;
type AsyncCallback = () => Promise<unknown>;
