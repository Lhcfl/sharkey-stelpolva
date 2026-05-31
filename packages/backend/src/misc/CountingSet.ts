/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { bindThis } from '@/decorators.js';

interface Opts {
	allowDebt?: boolean;
}

/**
 * Special set-like class that counts add() and delete() calls instead of ignoring duplicates.
 *
 * For example, 4x calls to add('hello, world!') followed by 3x calls to delete('hello, world!') will not actually remove the entry.
 * A 4th call to delete() *will* remove the entry, provided that no additional add() calls have been made.
 *
 * By default, the CountingSet will not count negative.
 * That is to say - calling delete() repeatedly for an item that has already been removed will have no effect.
 * If this is not desired, then the set can be configured to allow debt (negative counts) with a constructor parameter.
 */
export class CountingSet<T> implements Iterable<T> {
	/** Stores the value for all non-zero items. */
	private readonly map = new Map<T, number>();

	/** Stores all positive-count items. */
	private readonly value = new Set<T>();

	/** Stores all negative-count items. */
	private readonly debt = new Set<T>();

	/**
	 * If true, item counts may drop below zero and "into debt".
	 * If false (default), item counts are locked at zero and cannot go lower.
	 */
	public readonly allowDebt: boolean;

	constructor(opts?: Opts);
	constructor(input: Iterable<T>, opts?: Opts);
	constructor(inputOrOpts?: Iterable<T> | Opts, optsOrUndefined?: Opts) {
		// Decode opts
		const opts = inputOrOpts && !(Symbol.iterator in inputOrOpts) ? inputOrOpts : optsOrUndefined;
		this.allowDebt = opts?.allowDebt ?? false;

		// Load input
		const input = inputOrOpts && Symbol.iterator in inputOrOpts ? inputOrOpts : undefined;
		if (input) {
			for (const item of input) {
				this.add(item);
			}
		}
	}

	/**
	 * The number of items present in the set.
	 * Only positive counts are included; items with a zero or negative count are excluded.
	 */
	public get size(): number {
		return this.value.size;
	}

	/**
	 * Adds an item to the set and returns the new count.
	 * By default, this number will never be less than zero.
	 * If debt is enabled, then it will be negative if the same item has been removed more than it's been added.
	 */
	@bindThis
	public add(item: T, stacks = 1): number {
		return this.incrementCount(item, stacks);
	}

	/**
	 * Removes an item from the set and returns the new count.
	 * By default, this number will never be less than zero.
	 * If debt is enabled, then it will be negative if the same item has been removed more than it's been added.
	 */
	@bindThis
	public remove(item: T, stacks = 1): number {
		return this.incrementCount(item, 0 - stacks);
	}

	@bindThis
	private incrementCount(item: T, delta: number): number {
		const oldCount = this.count(item);
		const newCount = this.allowDebt
			? oldCount + delta
			: Math.max(0, oldCount + delta);

		if (oldCount !== newCount) {
			// 1. Remove from existing list when value "flips" sides or is incrementing in the correct direction.
			const removeFromValue = oldCount > 0 && (newCount <= 0 || newCount > oldCount);
			if (removeFromValue) {
				this.value.delete(item);
			}
			const removeFromDebt = oldCount < 0 && (newCount >= 0 || newCount < oldCount);
			if (removeFromDebt) {
				this.debt.delete(item);
			}

			// 2. Re-insert into the correct list.
			if (newCount < 0) {
				this.debt.add(item);
			} else if (newCount > 0) {
				this.value.add(item);
			}

			// 3. Update or remove from map.
			if (newCount === 0) {
				this.map.delete(item);
			} else {
				this.map.set(item, newCount);
			}
		}

		return newCount;
	}

	/**
	 * Alias for remove().
	 */
	@bindThis
	public delete(item: T): number {
		return this.remove(item);
	}

	/**
	 * Removes all instances of the given item from the set, returning its count to zero.
	 * Returns true if any counts were removed, false otherwise.
	 */
	@bindThis
	public zero(item: T): boolean {
		this.map.delete(item);
		this.debt.delete(item);
		return this.value.delete(item);
	}

	/**
	 * Returns the total count of all items in the set
	 * By default, this number will never be less than zero.
	 * If debt is enabled, then it will be negative if total debt is greater than total value.
	 */
	public count(): number;
	/**
	 * Returns the current count of an item.
	 * By default, this number will never be less than zero.
	 * If debt is enabled, then it will be negative if the same item has been removed more than it's been added.
	 */
	public count(item: T): number;
	@bindThis
	public count(item?: T): number {
		if (item) {
			return this.map.get(item) ?? 0;
		} else {
			return this.map.values().reduce((sum, next) => sum + next, 0);
		}
	}

	/**
	 * Returns true if the item is present with a positive count, or false otherwise.
	 */
	@bindThis
	public has(item: T): boolean {
		return this.value.has(item);
	}

	/**
	 * Removes all items and debt from the set, returning it to the initial empty state.
	 */
	@bindThis
	public clear(): void {
		this.debt.clear();
		this.value.clear();
		this.map.clear();
	}

	/**
	 * Alias to values().
	 */
	public [Symbol.iterator](): CountingSetIterator<T> {
		return this.values();
	}

	/**
	 * Returns all items with a positive value.
	 * Only positive counts are included; items with a zero or negative count are excluded.
	 */
	@bindThis
	public values(): CountingSetIterator<T> {
		const iter = this.value.values() as CountingSetIterator<T>;
		iter.size = this.value.size;
		return iter;
	}

	/**
	 * Returns all items with a negative value.
	 * Only negative counts (debt) are included; items with a zero or positive count are excluded.
	 */
	@bindThis
	public debts(): CountingSetIterator<T> {
		const iter = this.debt.values() as CountingSetIterator<T>;
		iter.size = this.debt.size;
		return iter;
	}

	/**
	 * Returns all items tracked in the set, whether present (having a positive count) or not.
	 */
	@bindThis
	public entries(): CountingSetIterator<[ item: T, count: number ]> {
		const iter = this.map.entries() as CountingSetIterator<[ item: T, count: number ]>;
		iter.size = this.map.size;
		return iter;
	}

	/**
	 * Returns the oldest (least-recently added) item in the set, or undefined if the set is empty.
	 * Negative counts are ignored.
	 */
	@bindThis
	public oldest(): T | undefined {
		return this.value.values().next().value;
	}
}

export interface CountingSetIterator<T> extends SetIterator<T> {
	size: number;
}

/**
 * Type Guard for CountingSet.
 */
export function isCountingSet(value: unknown): value is CountingSet<unknown> {
	if (value == null) return false;
	if (typeof(value) !== 'object') return false;
	return value instanceof CountingSet;
}
