/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { CountingSet, isCountingSet } from '@/misc/CountingSet.js';

describe(CountingSet, () => {
	describe('constructor', () => {
		describe('with no args', () => {
			it('should create empty set', () => {
				const result = new CountingSet();

				expect(result.size).toBe(0);
			});

			it('should disable debt', () => {
				const result = new CountingSet();

				expect(result.allowDebt).toBe(false);
			});
		});

		describe('with input', () => {
			it('should create populated set', () => {
				const input = [1, 2, 2, 3, 3, 3];

				const result = new CountingSet(input);

				expect(result.entries().toArray()).toEqual([[1, 1], [2, 2], [3, 3]]);
			});

			it('should disable debt', () => {
				const result = new CountingSet();

				expect(result.allowDebt).toBe(false);
			});
		});

		describe('with opts', () => {
			it('should create empty set', () => {
				const opts = { allowDebt: true };

				const result = new CountingSet(opts);

				expect(result.size).toBe(0);
			});

			it('should enable debt', () => {
				const opts = { allowDebt: true };

				const result = new CountingSet(opts);

				expect(result.allowDebt).toBe(true);
			});
		});

		describe('with input and opts', () => {
			it('should create populated set', () => {
				const opts = { allowDebt: true };
				const input = [1, 2, 2, 3, 3, 3];

				const result = new CountingSet(input, opts);

				expect(result.entries().toArray()).toEqual([[1, 1], [2, 2], [3, 3]]);
			});

			it('should enable debt', () => {
				const opts = { allowDebt: true };
				const input = [1, 2, 2, 3, 3, 3];

				const result = new CountingSet(input, opts);

				expect(result.allowDebt).toBe(true);
			});
		});
	});

	describe('size', () => {
		it('should be zero for empty set', () => {
			const set = new CountingSet();

			expect(set.size).toBe(0);
		});

		it('should count positive items', () => {
			const set = new CountingSet();
			set.add(1);
			set.add(2, 2);

			expect(set.size).toBe(2);
		});

		it('should not count zero items', () => {
			const set = new CountingSet();
			set.add(1);
			set.add(2, 2);
			set.remove(1);

			expect(set.size).toBe(1);
		});

		it('should not count negative items', () => {
			const set = new CountingSet();
			set.add(1);
			set.add(2, 2);
			set.remove(2, 2);

			expect(set.size).toBe(1);
		});
	});

	describe('add', () => {
		it('should add item if not present', () => {
			const set = new CountingSet<number>();

			set.add(1);

			expect(set.count(1)).toBe(1);
		});

		it('should increment item if already present', () => {
			const set = new CountingSet<number>();
			set.add(1);

			set.add(1);

			expect(set.count(1)).toBe(2);
		});

		it('should respect number of stacks', () => {
			const set = new CountingSet<number>();

			set.add(1, 2);

			expect(set.count(1)).toBe(2);
		});

		it('should do nothing with zero stacks', () => {
			const set = new CountingSet<number>();

			set.add(1, 0);

			expect(set.count(1)).toBe(0);
		});

		it('should remove negative stacks', () => {
			const set = new CountingSet<number>();
			set.add(1);

			set.add(1, -1);

			expect(set.count(1)).toBe(0);
		});

		it('should raise out of debt', () => {
			const set = new CountingSet<number>({ allowDebt: true });
			set.remove(1);

			set.add(1, 2);

			expect(set.count(1)).toBe(1);
		});
	});

	for (const func of ['remove', 'delete']) {
		describe(func, () => {
			it('should do nothing item if not present', () => {
				const set = new CountingSet<number>();

				set.remove(1);

				expect(set.count(1)).toBe(0);
			});

			it('should decrement item if already present', () => {
				const set = new CountingSet<number>();
				set.add(1);

				set.remove(1);

				expect(set.count(1)).toBe(0);
			});

			it('should respect number of stacks', () => {
				const set = new CountingSet<number>();
				set.add(1, 3);

				set.remove(1, 2);

				expect(set.count(1)).toBe(1);
			});

			it('should do nothing with zero stacks', () => {
				const set = new CountingSet<number>();

				set.remove(1, 0);

				expect(set.count(1)).toBe(0);
			});

			it('should add negative stacks', () => {
				const set = new CountingSet<number>();
				set.add(1);

				set.remove(1, -1);

				expect(set.count(1)).toBe(2);
			});

			it('should go into debt', () => {
				const set = new CountingSet<number>({ allowDebt: true });
				set.add(1);

				set.remove(1, 2);

				expect(set.count(1)).toBe(-1);
			});
		});
	}

	describe('zero', () => {
		it('should set count to zero for positive item', () => {
			const set = new CountingSet<number>();
			set.add(1);

			set.zero(1);

			expect(set.count(1)).toBe(0);
		});

		it('should set count to zero for negative item', () => {
			const set = new CountingSet<number>();
			set.remove(1);

			set.zero(1);

			expect(set.count(1)).toBe(0);
		});

		it('do nothing for mising item', () => {
			const set = new CountingSet<number>();

			set.zero(1);

			expect(set.count(1)).toBe(0);
		});
	});

	describe('count', () => {
		describe('with no args', () => {
			it('should return total count of all items', () => {
				const set = new CountingSet<number>();
				set.add(1, 1);
				set.add(2, 2);
				set.add(3, 3);

				const result = set.count();

				expect(result).toBe(6);
			});

			it('should include debt', () => {
				const set = new CountingSet<number>({ allowDebt: true });
				set.add(1, 1);
				set.remove(2, 2);
				set.add(3, 3);

				const result = set.count();

				expect(result).toBe(2);
			});
		});

		describe('with item', () => {
			it('should return count for positive item', () => {
				const set = new CountingSet<number>({ allowDebt: true });
				set.add(1, 1);
				set.remove(2, 2);

				const result = set.count(1);

				expect(result).toBe(1);
			});

			it('should return count for negative item', () => {
				const set = new CountingSet<number>({ allowDebt: true });
				set.add(1, 1);
				set.remove(2, 2);

				const result = set.count(2);

				expect(result).toBe(-2);
			});

			it('should return zero for missing item', () => {
				const set = new CountingSet<number>();
				set.add(1, 1);
				set.remove(2, 2);

				const result = set.count(3);

				expect(result).toBe(0);
			});
		});
	});

	describe('has', () => {
		it('should return true for positive item', () => {
			const set = new CountingSet<number>({ allowDebt: true });
			set.add(1, 1);
			set.remove(2, 2);

			const result = set.has(1);

			expect(result).toBe(true);
		});

		it('should return false for negative item', () => {
			const set = new CountingSet<number>({ allowDebt: true });
			set.add(1, 1);
			set.remove(2, 2);

			const result = set.has(2);

			expect(result).toBe(false);
		});

		it('should return false for missing item', () => {
			const set = new CountingSet<number>({ allowDebt: true });
			set.add(1, 1);
			set.remove(2, 2);

			const result = set.has(3);

			expect(result).toBe(false);
		});
	});

	describe('clear', () => {
		it('should remove positive items', () => {
			const set = new CountingSet<number>();
			set.add(1, 1);
			set.add(2, 2);

			set.clear();

			expect(set.size).toBe(0);
			expect(set.count()).toBe(0);
			expect(set.values().size).toBe(0);
			expect(set.debts().size).toBe(0);
		});

		it('should remove negative items', () => {
			const set = new CountingSet<number>({ allowDebt: true });
			set.add(1, -1);
			set.add(2, -2);

			set.clear();

			expect(set.size).toBe(0);
			expect(set.count()).toBe(0);
			expect(set.values().size).toBe(0);
			expect(set.debts().size).toBe(0);
		});

		it('should ignore empty set', () => {
			const set = new CountingSet<number>();

			set.clear();

			expect(set.size).toBe(0);
			expect(set.count()).toBe(0);
			expect(set.values().size).toBe(0);
			expect(set.debts().size).toBe(0);
		});
	});

	for (const func of [Symbol.iterator, 'values']) {
		describe(String(func), () => {
			it('should expose size', () => {
				const set = new CountingSet<number>({ allowDebt: true });
				set.add(1, 1);
				set.add(2, 2);
				set.remove(3, 3);

				const result = set[func]();

				expect(result.size).toBe(2);
			});

			it('should iterate positive items', () => {
				const set = new CountingSet<number>({ allowDebt: true });
				set.add(1, 1);
				set.add(2, 2);
				set.remove(3, 3);

				const result = set[func]().toArray();

				expect(result).toEqual([1, 2]);
			});
		});
	}

	describe('debts', () => {
		it('should expose size', () => {
			const set = new CountingSet<number>({ allowDebt: true });
			set.add(1, 1);
			set.remove(2, 2);
			set.remove(3, 3);

			const result = set.debts();

			expect(result.size).toBe(2);
		});

		it('should iterate negative items', () => {
			const set = new CountingSet<number>({ allowDebt: true });
			set.add(1, 1);
			set.remove(2, 2);
			set.remove(3, 3);

			const result = set.debts().toArray();

			expect(result).toEqual([2, 3]);
		});
	});

	describe('entries', () => {
		it('should expose size', () => {
			const set = new CountingSet<number>({ allowDebt: true });
			set.add(1, 1);
			set.remove(2, 2);
			set.remove(3, 3);

			const result = set.entries();

			expect(result.size).toBe(3);
		});

		it('should iterate all items', () => {
			const set = new CountingSet<number>({ allowDebt: true });
			set.add(1, 1);
			set.remove(2, 2);
			set.remove(3, 3);

			const result = set.entries().toArray();

			expect(result).toEqual([[1, 1], [2, -2], [3, -3]]);
		});
	});

	describe('oldest', () => {
		it('should return least-recent positive item', () => {
			const set = new CountingSet<number>({ allowDebt: true });
			set.add(1);
			set.add(2);
			set.add(3);
			set.add(1);

			const result = set.oldest();

			expect(result).toBe(2);
		});

		it('should ignore negative items', () => {
			const set = new CountingSet<number>({ allowDebt: true });
			set.add(1);
			set.add(2, -1);
			set.add(3);
			set.add(1);

			const result = set.oldest();

			expect(result).toBe(3);
		});

		it('should ignore decrements', () => {
			const set = new CountingSet<number>({ allowDebt: true });
			set.add(1, 2);
			set.add(2);
			set.add(3);
			set.remove(1);

			const result = set.oldest();

			expect(result).toBe(1);
		});
	});
});

describe(isCountingSet, () => {
	it('should return false for null', () => {
		const input = null;

		const result = isCountingSet(input);

		expect(result).toBe(false);
	});

	it('should return false for non-object', () => {
		const input = 1;

		const result = isCountingSet(input);

		expect(result).toBe(false);
	});

	it('should return false for constructor', () => {
		const input = CountingSet;

		const result = isCountingSet(input);

		expect(result).toBe(false);
	});

	it('should return true for instance', () => {
		const input = new CountingSet();

		const result = isCountingSet(input);

		expect(result).toBe(true);
	});
});
