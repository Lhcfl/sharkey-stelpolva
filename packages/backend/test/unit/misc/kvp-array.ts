/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { makeKVPArray } from '@/misc/kvp-array.js';

describe(makeKVPArray, () => {
	it('should add keys property', () => {
		const array = [['1', 1], ['2', 2], ['3', 3]] as const;

		const result = makeKVPArray(array);

		expect(result).toHaveProperty('keys');
	});

	it('should add values property', () => {
		const array = [['1', 1], ['2', 2], ['3', 3]] as const;

		const result = makeKVPArray(array);

		expect(result).toHaveProperty('values');
	});

	it('should preserve values', () => {
		const array: [string, number][] = [['1', 1], ['2', 2], ['3', 3]];

		const result = makeKVPArray(array);

		expect(result).toEqual(array);
	});

	it('should accept empty array', () => {
		const array = [] as const;

		const result = makeKVPArray(array);

		expect(result).toHaveProperty('keys');
		expect(result).toHaveProperty('values');
		expect(result).toHaveLength(0);
	});
});

describe('keys', () => {
	it('should return all keys', () => {
		const array = [['1', 1], ['2', 2], ['3', 3]] as const;

		const result = makeKVPArray(array);

		expect(result.keys).toEqual(['1', '2', '3']);
	});

	it('should preserve duplicates', () => {
		const array = [['1', 1], ['1', 1], ['1', 1]] as const;

		const result = makeKVPArray(array);

		expect(result.keys).toEqual(['1', '1', '1']);
	});
});

describe('values', () => {
	it('should return all values', () => {
		const array = [['1', 1], ['2', 2], ['3', 3]] as const;

		const result = makeKVPArray(array);

		expect(result.values).toEqual([1, 2, 3]);
	});

	it('should preserve duplicates', () => {
		const array = [['1', 1], ['1', 1], ['1', 1]] as const;

		const result = makeKVPArray(array);

		expect(result.values).toEqual([1, 1, 1]);
	});
});
