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
 * Basic type guard for IdentifiableError.
 * Accepts unknown, so it's usable in catch blocks.
 */
export function isIdentifiableError(error: unknown, id?: string): error is IdentifiableError {
	if (error instanceof IdentifiableError) {
		return id == null || id === error.id;
	}
	return false;
}

/**
 * Standard error codes to reference throughout the app
 */
export const errorCodes = {
	/** User has been deleted (hard or soft deleted) */
	userDeleted: '4cac9436-baa3-4955-a368-7628aea676cf',

	/** User is suspended (directly or by instance) */
	userSuspended: '1e56d624-737f-48e4-beb6-0bdddb9fa809',

	/** User is protected (root, system, etc) */
	userProtected: 'b5983a6a-9930-4c06-966b-d1cac0054544',

	/** User is blocked by the target user(s) */
	userBlocked: '3338392a-f764-498d-8855-db939dcf8c48',

	/** User was expected to be remote, but was local instead. */
	userNotRemote: 'aeac1339-2550-4521-a8e3-781f06d98656',

	/** User was expected to be local, but was remote instead. */
	userNotLocal: 'feb908c1-d507-4157-9b44-2fa5540e2ad8',

	/** User is not approved */
	userNotApproved: '28d1b376-fb56-4122-8d4f-29e01f345c60',

	/** User has no valid featured collection (not defined, invalid, etc) */
	noFeaturedCollection: '2aa4766e-b7d8-4291-a671-56800498b085',

	/** String URL failed security or correctness validation */
	urlValidationFailed: '0bedd29b-e3bf-4604-af51-d3352e2518af',

	/** ActivityPub object failed security or correctness validation */
	apValidationFailed: '215f1d40-042c-4ca2-bd75-80ada243de33',

	/** ActivityPub resource could not be fetched due to an unexpected error. */
	apFetchFailed: 'fe5a647e-09cb-4bcb-b582-3603fa7fac30',

	/** Federation with the host is not allowed, either because it is blocked or not allow-listed */
	federationNotAllowed: '0a72bf24-2d9b-4f1d-886b-15aaa31adeda',

	/** Note could not be federated as localOnly is true */
	cannotFederateLocalOnlyNote: 'd25f66c9-2013-401e-af02-88e3796be12d',

	/** An internal assertion / sanity check failed. This error typically indicates a software bug. */
	assertionFailed: '8418fdc0-20ea-449d-a98e-5189d08d5ca9',

	/** No suitable local user could be found to sign an outbound AP request. */
	noFetchUser: 'a65d9a9a-e307-429f-aa96-630ba570e5f1',

	/** Note has been deleted (hard or soft deleted) */
	noteNotFound: '39934113-e4f6-45d8-821b-a760c686bf1d',

	/** Note was expected to be remote, but was local instead. */
	noteNotRemote: '354e5bc8-e10b-462d-8ec5-5d5be07e34e1',

	/** Note was expected to be local, but was remote instead. */
	noteNotLocal: '0fac7056-2329-4ee7-88a0-a9d4dded3264',

	/** WebSocket server encountered an error. */
	websocketError: '4b277ff0-88f6-4ddc-8960-8058e76b3677',
} as const;
