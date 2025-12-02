/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * ID付きエラー
 */
export class IdentifiableError extends Error {
	// Fix the error name in stack traces - https://stackoverflow.com/a/71573071
	override name = this.constructor.name;

	public message: string;
	public id: string;

	/**
	 * Indicates that this is a temporary error that may be cleared by retrying
	 */
	public readonly isRetryable: boolean;

	constructor(id: string, message?: string, isRetryable = false, cause?: unknown) {
		super(message, cause ? { cause } : undefined);
		this.message = message ?? '';
		this.id = id;
		this.isRetryable = isRetryable;
	}
}

/**
 * Standard error codes to reference throughout the app
 */
export const errorCodes = {
	// User has been deleted (hard or soft deleted)
	userIsDeleted: '4cac9436-baa3-4955-a368-7628aea676cf',
	// User is suspended (directly or by instance)
	userIsSuspended: '1e56d624-737f-48e4-beb6-0bdddb9fa809',
	// User has no valid featured collection (not defined, invalid, etc)
	noFeaturedCollection: '2aa4766e-b7d8-4291-a671-56800498b085',
} as const;
