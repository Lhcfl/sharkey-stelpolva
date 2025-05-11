/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/*
 * Important Note: this file must be kept in sync with packages/frontend-shared/js/append-content-warning.ts
 */

/**
 * Appends an additional content warning onto an existing one.
 * The additional value will not be added if it already exists within the original input.
 * @param original Existing content warning
 * @param additional Content warning to append
 * @param reverse If true, then the additional CW will be prepended instead of appended.
 */
export function appendContentWarning(original: string | null | undefined, additional: string, reverse?: boolean): string;
export function appendContentWarning(original: string, additional: string | null | undefined, reverse?: boolean): string;
export function appendContentWarning(original: string | null | undefined, additional: string | null | undefined, reverse?: boolean): string | null;
export function appendContentWarning(original: string | null | undefined, additional: string | null | undefined, reverse = false): string | null {
	// Easy case - if original is empty, then additional replaces it.
	if (!original) {
		return additional ?? null;
	}

	// Easy case - if the additional CW is empty, then don't append it.
	if (!additional) {
		return original;
	}

	// If the additional CW already exists in the input, then we *don't* append another copy!
	if (includesWholeWord(original, additional)) {
		return original;
	}

	return reverse
		? `${additional}, ${original}`
		: `${original}, ${additional}`;
}

/**
 * Emulates a regular expression like /\b(pattern)\b/, but with a raw non-regex pattern.
 * We're checking to see whether the default CW appears inside the existing CW, but *only* if there's word boundaries on either side.
 * @param input Input string to search
 * @param target Target word / phrase to search for
 */
function includesWholeWord(input: string, target: string): boolean {
	const parts = input.split(target);

	// The additional string could appear multiple times within the original input.
	// We need to check each occurrence, since any of them could potentially match.
	for (let i = 0; i + 1 < parts.length; i++) {
		const before = parts[i];
		const after = parts[i + 1];

		// If either the preceding or following tokens are a "word", then this "match" is actually just part of a longer word.
		// Likewise, if *neither* token is a word, then this is a real match and the CW already exists in the input.
		if (!/\w$/.test(before) && !/^\w/.test(after)) {
			return true;
		}
	}

	// If we don't match, then there is no existing CW.
	return false;
}
