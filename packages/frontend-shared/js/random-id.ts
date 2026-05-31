/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const MAX_ID_INT = Math.pow(2, 50);

/**
 * Returns a non-cryptographically-secure 50-bit random ID encoded as a base-26 string.
 * The output of this function is always 10 characters exactly, as 50 bits fits perfectly into 10 characters at 5 bits-per-character.
 *
 * Keep in sync with backend IdService.genSimple().
 *
 * @param random 	Unit float (0.0 to 1.0) used as source of random.
 * 								Exposed for unit testing only; should be undefined for production mode!
 * @returns 10-digit string containing 50 bits of non-secure entropy.
 */
export function randomId(random?: number): string {
	if (random != null && random < 0) throw new Error(`random basis out of range: ${random}`);
	if (random != null && random > 1) throw new Error(`random basis out of range: ${random}`);
	const randomFloat = random ?? Math.random();
	const randomInt = Math.round(randomFloat * MAX_ID_INT);
	return randomInt.toString(26).padStart(10, '0');
}
