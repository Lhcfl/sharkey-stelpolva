/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { deepEquals } from '@/misc/deep-equals.js';
import { CountingSet } from '@/misc/CountingSet.js';

describe(deepEquals, () => {
	describe('when comparing different types', () => {
		const types = [
			['string', '1'],
			['number', 1],
			['bigint', 1n],
			['boolean', true],
			['undefined', undefined],
			['symbol', Symbol('1')],
			['null', null],
			['object', { 1: 1 }],
			['Map', new Map([[1, 1]])],
			['array', [1]],
			['Set', new Set([1])],
			['CountingSet', new CountingSet([1])],
			['RegEx', /1/],
			['function', () => 1],
		] as const;

		testMatrix(types);
	});

	describe('when comparing symbols', () => {
		const symbols = [
			['well-known', Symbol.toStringTag],
			['anonymous', Symbol()],
			['named(1)', Symbol('named')],
			['named(2)', Symbol('named')],
		] as const;

		testMatrix(symbols);
	});

	describe('when comparing numbers', () => {
		const numbers = [
			['zero', 0],
			['one', 1],
			['NaN', Number.NaN],
			['+Infinity', Number.POSITIVE_INFINITY],
			['-Infinity', Number.NEGATIVE_INFINITY],
		] as const;

		testMatrix(numbers);
	});

	describe('when comparing strings', () => {
		const strings = [
			['empty', ''],
			['whitespace', ' '],
			['lowercase', 'text'],
			['capitalized', 'TEXT'],
		] as const;

		testMatrix(strings);
	});

	describe('when comparing objects', () => {
		class TestClass1 {
			constructor(public prop: string) {}
		}
		class TestClass2 {
			constructor(public prop: string) {}
		}
		class TestClass3 extends TestClass2 {
			constructor(prop1: string, public prop2: string) {
				super(prop1);
			}
		}

		const objects = [
			['null', null],
			['empty', {}],
			['basic(1)', { key: 'value' }],
			['basic(2)', { foo: 'bar' }],
			['basic(3)', { key: 'value', foo: 'bar' }],
			['basic(4)', { key: 'value2' }],
			['basic(5)', { key2: 'value' }],
			['instance(1)', new TestClass1('1')],
			['instance(2)', new TestClass1('2')],
			['instance(3)', new TestClass2('1')],
			['instance(4)', new TestClass3('1', '2')],
		] as const;

		testMatrix(objects);

		it('should ignore key order', () => {
			const object1 = { '1': 1, '2': 2, '3': 3 };
			const object2 = { '2': 2, '3': 3, '1': 1 };

			const result = deepEquals(object1, object2);

			expect(result).toBe(true);
		});

		it('should recurse into nested values', () => {
			const object1 = { a: [{ b: 1 }] };
			const object2 = { a: [{ b: 2 }] };

			const result = deepEquals(object1, object2);

			expect(result).toBe(false);
		});
	});

	describe('when comparing maps', () => {
		const maps = [
			['empty', new Map()],
			['key=>value', new Map([['key', 'value']])],
			['key=>other', new Map([['key', 'other']])],
			['other=>value', new Map([['other', 'value']])],
			['superset', new Map([['key', 'value'], ['other', 'value']])],
		] as const;

		testMatrix(maps);

		it('should ignore key order', () => {
			const map1 = new Map([['1', 1], ['2', 2], ['3', 3]]);
			const map2 = new Map([['2', 2], ['3', 3], ['1', 1]]);

			const result = deepEquals(map1, map2);

			expect(result).toBe(true);
		});

		it('should recurse into nested values', () => {
			const map1 = new Map([['a', new Map([['b', 1]])]]);
			const map2 = new Map([['a', new Map([['b', 2]])]]);

			const result = deepEquals(map1, map2);

			expect(result).toBe(false);
		});
	});

	describe('when comparing arrays', () => {
		const arrays = [
			['empty', []],
			['basic(1)', [1]],
			['basic(2)', [2]],
			['basic(3)', [1, 2]],
			['basic(4)', ['1', '2']],
			['sparse(1)', [undefined, 2]],
			['sparse(2)', [1, undefined]],
			['fake', { 0: 1 }],
		] as const;

		testMatrix(arrays);

		it('should recurse into nested values', () => {
			const array1 = [[1]];
			const array2 = [[2]];

			const result = deepEquals(array1, array2);

			expect(result).toBe(false);
		});
	});

	describe('when comparing sets', () => {
		const sets = [
			['empty', new Set()],
			['basic(1)', new Set([1])],
			['basic(2)', new Set([2])],
			['basic(3)', new Set([1, 2])],
			['basic(4)', new Set(['1', '2'])],
		] as const;

		testMatrix(sets);

		it('should ignore value order', () => {
			const set1 = new Set([1, 2, 3]);
			const set2 = new Set([2, 3, 1]);

			const result = deepEquals(set1, set2);

			expect(result).toBe(true);
		});

		it('should recurse into nested values', () => {
			const set1 = new Set([new Set([1])]);
			const set2 = new Set([new Set([2])]);

			const result = deepEquals(set1, set2);

			expect(result).toBe(false);
		});
	});

	describe('when comparing counting sets', () => {
		const withDebt = new CountingSet([1], { allowDebt: true });
		withDebt.delete(2);

		const sets = [
			['empty', new CountingSet()],
			['basic(1)', new CountingSet([1])],
			['basic(2)', new CountingSet([2])],
			['basic(3)', new CountingSet([1, 2])],
			['basic(4)', new CountingSet(['1', '2'])],
			['stacks', new CountingSet([1, 1])],
			['debt', withDebt],
		] as const;

		testMatrix(sets);

		it('should ignore value order', () => {
			const set1 = new CountingSet([1, 2, 3]);
			const set2 = new CountingSet([2, 3, 1]);

			const result = deepEquals(set1, set2);

			expect(result).toBe(true);
		});

		it('should recurse into nested values', () => {
			const set1 = new CountingSet([new CountingSet([1])]);
			const set2 = new CountingSet([new CountingSet([2])]);

			const result = deepEquals(set1, set2);

			expect(result).toBe(false);
		});
	});

	describe('when comparing regular expressions', () => {
		const regexes = [
			['basic(1)', /1/],
			['basic(2)', /2/],
			['flags(1)', /1/g],
			['flags(2)', /1/i],
			['flags(3)', /1/gi],
		] as const;

		testMatrix(regexes);

		it('should ignore flag order', () => {
			const regex1 = /i/gi;
			const regex2 = /i/ig;

			const result = deepEquals(regex1, regex2);

			expect(result).toBe(true);
		});
	});

	describe('when comparing dates', () => {
		const dates = [
			['epoch', new Date(0)],
			['epoch+1', new Date(1)],
			['date', new Date(2026, 2, 24)],
			['date+time', new Date(2026, 2, 24, 12, 12, 12)],
			['date+time+millis', new Date(2026, 2, 24, 12, 12, 12, 120)],
		] as const;

		testMatrix(dates);
	});

	describe('when comparing deep object graphs', () => {
		it('should deep-compare recursively', () => {
			const input1 = {
				repeated: { foo: 'bar' },
				array: [{ foo: 'bar' }, { foo: 'bar' }],
				set: new Set([{ foo: 'bar' }]),
				countingSet: new CountingSet([{ foo: 'bar' }]),
				map: new Map([[{ foo: 'bar' }, { foo: 'bar' }]]),
			};
			const input2 = {
				repeated: { foo: 'bar' },
				array: [{ foo: 'bar' }, { foo: 'bar' }],
				set: new Set([{ foo: 'bar' }]),
				countingSet: new CountingSet([{ foo: 'bar' }]),
				map: new Map([[{ foo: 'bar' }, { foo: 'bar' }]]),
			};

			const result = deepEquals(input1, input2);

			expect(result).toBe(true);
		});

		it('should accept the same object multiple times', () => {
			const repeated = { foo: 'bar' };
			const input1 = {
				repeated,
				array: [repeated, repeated],
				set: new Set([repeated]),
				countingSet: new CountingSet([repeated]),
				map: new Map([[repeated, repeated]]),
			};
			const input2 = {
				repeated,
				array: [repeated, repeated],
				set: new Set([repeated]),
				countingSet: new CountingSet([repeated]),
				map: new Map([[repeated, repeated]]),
			};

			const result = deepEquals(input1, input2);

			expect(result).toBe(true);
		});

		it('should skip recursive objects', () => {
			const input1: Record<string, unknown> = {};
			const input2: Record<string, unknown> = {};
			const inner = { input1, input2 };
			input1.inner = inner;
			input2.inner = inner;

			const result = deepEquals(input1, input2);

			expect(result).toBe(true);
		});
	});
});

function testMatrix(matrix: readonly (readonly [label: string, value: unknown])[]): void {
	// Compare each sample to itself
	for (let x = 0; x < matrix.length; x++) {
		for (let y = 0; y < matrix.length; y++) {
			// Value compared to itself should be true.
			// Value compared to anything else should be false.
			const expectedResult = (x === y);

			it(`should return ${expectedResult} for ${matrix[x][0]} and ${matrix[y][0]}`, () => {
				const input1 = matrix[x][1];
				const input2 = matrix[y][1];

				const result = deepEquals(input1, input2);

				expect(result).toBe(expectedResult);
			});
		}
	}
}
