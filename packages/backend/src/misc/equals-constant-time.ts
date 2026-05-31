/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Constant-time string comparison for use in security contexts.
 * @param input User-provided input string
 * @param expected Secret string to compare against.
 */
export function equalsConstantTime(input: string, expected: string): boolean {
	// This ensures that different-length strings are never equal, without compromising constant-time behavior.
	let stringsAreEqual = input.length === expected.length;

	// Make sure loop size is always equal to input length, even if input and expected have different lengths.
	// This prevents an attacker from determining the expected length with controlled input sizes.
	for (let i = 0; i < input.length; i++) {
		// Branchless overflow handling.
		// Can produce false-positive matches if inputSize and expectedSize are different, but that case is handled by the initial length check above.
		const inputChar = input.charCodeAt(i % input.length);
		const expectedChar = expected.charCodeAt(i % expected.length);

		// Branchless, failure-preserving character comparison using numeric character values instead of string characters.
		const charsAreEqual = inputChar === expectedChar;
		stringsAreEqual &&= charsAreEqual;
	}

	// Since this is accumulated with AND, it will be false if lengths are different OR if any character does not match.
	return stringsAreEqual;
}
