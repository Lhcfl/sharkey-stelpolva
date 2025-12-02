/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Key-Value Pair Array - stores a collection of Key/Value pairs with helper methods to access ordered keys/values.
 * Keys and Values can be of any type, and Keys default to type "string" if unspecified.
 */
export type KVPArray<T, K = string> = KVPs<T, K> & {
	/**
	 * Lazy-loaded array of all keys in the array, matching the order of the pairs.
	 */
	readonly keys: readonly K[],

	/**
	 * Lazy-loaded array of all values in the array, matching the order of the pairs.
	 */
	readonly values: readonly T[],
};

type KVPs<V, K = string> = Omit<readonly KVP<V, K>[], 'keys' | 'values' | 'entries'>;
type KVP<T, K = string> = readonly [key: K, value: T];

/**
 * Wraps an array of Key/Value pairs into a KVPArray.
 */
export function makeKVPArray<T, K = string>(pairs: KVPs<T, K>): KVPArray<T, K> {
	let keys: K[] | null = null;
	let values: T[] | null = null;

	Object.defineProperties(pairs, {
		keys: {
			get() {
				return keys ??= pairs.map(pair => pair[0]);
			},
			enumerable: false,
		},
		values: {
			get() {
				return values ??= pairs.map(pair => pair[1]);
			},
			enumerable: false,
		},
	});

	return pairs as KVPArray<T, K>;
}
