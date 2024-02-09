/*
 * SPDX-FileCopyrightText: dakkar and other sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as crypto from 'node:crypto';

export function secureishCompare(expected: string, given:string) {
	const expectedLen = expected.length;
	const givenLen = given.length;

	/*
		this ensures that the two strings are the same length, so
		`timingSafeEqual` will not throw an error

		notice that we perform the same operations regardless of the
		length of the strings, we're trying not to leak timing
		information!
	*/
	const paddedExpected = Buffer.from(expected + given);
	const paddedGiven = Buffer.from(given + expected);

	/*
		if the two strings were equal, `sortOfEqual` will be true

		if will be true in other cases, too! like `abc` and `abcabc`; but
		then, `expectedLen` and `givenLen` would be different, and we'd
		return false
	*/
	const sortOfEqual = crypto.timingSafeEqual(paddedExpected, paddedGiven);

	return sortOfEqual && (givenLen === expectedLen);
}
