/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function fromTuple<T>(value: T | [T]): T;
export function fromTuple<T>(value: T | [T] | T[]): T | undefined;
export function fromTuple<T>(value: T | [T] | T[]): T | undefined {
	if (Array.isArray(value)) {
		return value[0];
	}

	return value;
}
