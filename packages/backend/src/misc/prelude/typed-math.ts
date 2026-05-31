/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Math.max(), but it preserves custom types.
 */
export function max<T extends number>(...nums: [T, ...T[]]): T {
	return Math.max(...nums) as T;
}

/**
 * Math.min(), but it preserves custom types.
 */
export function min<T extends number>(...nums: [T, ...T[]]): T {
	return Math.min(...nums) as T;
}
