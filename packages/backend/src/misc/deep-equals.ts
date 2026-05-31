/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { types } from 'node:util';
import { isCountingSet } from '@/misc/CountingSet.js';

/**
 * Checks whether two provided values are deeply identical.
 * Follows enumerable keys only, and handles recursive object graphs.
 */
export function deepEquals<T>(first: T, second: T): boolean {
	const seen = new Map<unknown, Set<unknown>>();
	return compare(first, second, seen);
}

function compare(first: unknown, second: unknown, seen: Map<unknown, Set<unknown>>): boolean {
	// Nullish values are compared by equality
	if (first == null || second == null) {
		return first === second;
	}

	// Compare arrays by contents
	if (Array.isArray(first)) {
		if (!Array.isArray(second)) return false;
		if (checkSeen(first, second, seen)) return true;
		if (first.length !== second.length) return false;

		for (let i = 0; i < first.length; i++) {
			if (!compare(first[i], second[i], seen)) {
				return false;
			}
		}

		return true;
	} else if (Array.isArray(second)) {
		return false;
	}

	// Compare Sets by values
	if (types.isSet(first)) {
		if (!types.isSet(second)) return false;
		if (checkSeen(first, second, seen)) return true;

		const set1 = first as Set<unknown>;
		const set2 = second as Set<unknown>;
		if (set1.size !== set2.size) return false;

		const firstEntries = set1.entries();
		const secondEntries = set2.entries();
		return compareIterables(firstEntries, secondEntries, seen);
	} else if (types.isSet(second)) {
		return false;
	}

	// Compare counting sets by value + count
	if (isCountingSet(first)) {
		if (!isCountingSet(second)) return false;
		if (checkSeen(first, second, seen)) return true;

		const firstEntries = first.entries();
		const secondEntries = second.entries();
		if (firstEntries.size !== secondEntries.size) return false;

		return compareIterables(firstEntries, secondEntries, seen);
	} else if (isCountingSet(second)) {
		return false;
	}

	// Compare Maps by contents
	if (types.isMap(first)) {
		if (!types.isMap(second)) return false;
		if (checkSeen(first, second, seen)) return true;

		const map1 = first as Map<unknown, unknown>;
		const map2 = second as Map<unknown, unknown>;
		if (map1.size !== map2.size) return false;

		const firstEntries = map1.entries();
		const secondEntries = map2.entries();
		return compareIterables(firstEntries, secondEntries, seen);
	} else if (types.isMap(second)) {
		return false;
	}

	// Compare dates by value
	if (types.isDate(first)) {
		if (!types.isDate(second)) return false;

		const date1 = first as Date;
		const date2 = second as Date;

		return date1.getTime() === date2.getTime();
	} else if (types.isDate(second)) {
		return false;
	}

	// Compare RegEx by pattern + flags
	if (types.isRegExp(first)) {
		if (!types.isRegExp(second)) return false;

		const re1 = first as RegExp;
		const re2 = second as RegExp;
		if (re1.flags !== re2.flags) return false;

		return re1.toString() === re2.toString();
	} else if (types.isRegExp(second)) {
		return false;
	}

	// TODO support TypedArray, ArrayBuffer, and other "fancy" built-ins

	// Compare regular objects by prototypes, keys, and values
	if (typeof(first) === 'object') {
		if (typeof(second) !== 'object') return false;
		if (checkSeen(first, second, seen)) return true;
		if (Object.getPrototypeOf(first) !== Object.getPrototypeOf(second)) return false;

		const firstKeys = Object.keys(first);
		const secondKeys = Object.keys(second);
		if (firstKeys.length !== secondKeys.length) return false;

		for (const key of firstKeys) {
			if (!compare(first[key], second[key], seen)) {
				return false;
			}
		}

		return true;
	} else if (typeof(second) === 'object') {
		return false;
	}

	if (typeof(first) === 'number') {
		if (typeof(second) !== 'number') return false;

		if (Number.isNaN(first)) return Number.isNaN(second);
		return first === second;
	} else if (typeof(second) === 'number') {
		return false;
	}

	// Compare primitives & functions by strict equality
	return first === second;
}

/**
 * Order-independent, semantic, and fuzzy compare of two iterables.
 */
function compareIterables(first: Iterable<unknown>, second: Iterable<unknown>, seen: Map<unknown, Set<unknown>>): boolean {
	const secondItems = Array.from(second);

	for (const firstItem of first) {
		const matchIdx = secondItems.findIndex(secondItem => compare(firstItem, secondItem, seen));
		if (matchIdx < 0) {
			return false;
		}

		// "pop" the item that we consumed
		secondItems.splice(matchIdx, 1);
	}

	// Make sure there was nothing left over
	return secondItems.length === 0;
}

function checkSeen(first: unknown, second: unknown, seen: Map<unknown, Set<unknown>>): boolean {
	// check for compare(first, second)
	let firstSet = seen.get(first);
	if (firstSet?.has(second)) return true;

	// check for compare(second, first)
	let secondSet = seen.get(second);
	if (secondSet?.has(firstSet)) return true;

	// record compare(first, second)
	if (firstSet == null) {
		firstSet = new Set<string>();
		seen.set(first, firstSet);
	}
	firstSet.add(second);

	// record compare(second, first)
	if (secondSet == null) {
		secondSet = new Set<string>();
		seen.set(second, secondSet);
	}
	secondSet.add(first);

	return false;
}
