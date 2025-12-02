/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Common base class for DisposedError and DisposingError - please use only for catch() blocks.
 */
export abstract class DisposeError extends Error {
	// Fix the error name in stack traces - https://stackoverflow.com/a/71573071
	override name = this.constructor.name;

	public readonly source: string | undefined;

	protected constructor(opts?: { source?: string, message?: string }) {
		super(opts?.message);
		this.source = opts?.source;
	}
}

/**
 * Thrown when an attempt is made to use an object that has been disposed.
 */
export class DisposedError extends DisposeError {
	// Fix the error name in stack traces - https://stackoverflow.com/a/71573071
	override name = this.constructor.name;

	constructor(opts?: { source?: string, message?: string }) {
		super({
			source: opts?.source,
			message: opts?.message ?? `${opts?.source ?? 'Object'} has been disposed`,
		});
	}
}

/**
 * Thrown when an object is use begins disposing.
 */
export class DisposingError extends DisposeError {
	// Fix the error name in stack traces - https://stackoverflow.com/a/71573071
	override name = this.constructor.name;

	constructor(opts?: { source?: string, message?: string }) {
		super({
			source: opts?.source,
			message: opts?.message ?? `${opts?.source ?? 'Object'} is being disposed`,
		});
	}
}
