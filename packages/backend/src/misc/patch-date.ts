/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Replaces specific properties of a Date object while leaving all others unchanged.
 * Returns a new date, does not mutate the original.
 * @param date Reference date to modify.
 * @param patch Values to replace.
 */
export function patchDate(date: Date, patch: DatePatch): Date {
	return new Date(
		patch.year ?? date.getFullYear(),
		patch.month ?? date.getMonth(), // month number -1
		patch.day ?? date.getDate(), // getDate, not getDay!!
		patch.hours ?? date.getHours(),
		patch.minutes ?? date.getMinutes(),
		patch.seconds ?? date.getSeconds(),
		patch.milliseconds ?? date.getMilliseconds(),
	);
}

/**
 * Increments specific properties of a Date object while leaving all others unchanged.
 * Returns a new date, does not mutate the original.
 * @param date Reference date to modify.
 * @param patch Values to add.
 */
export function addPatch(date: Date, patch: DatePatch): Date {
	return new Date(
		(patch.year ?? 0) + date.getFullYear(),
		(patch.month ?? 0) + date.getMonth(), // month number -1
		(patch.day ?? 0) + date.getDate(), // getDate, not getDay!!
		(patch.hours ?? 0) + date.getHours(),
		(patch.minutes ?? 0) + date.getMinutes(),
		(patch.seconds ?? 0) + date.getSeconds(),
		(patch.milliseconds ?? 0) + date.getMilliseconds(),
	);
}

/**
 * Extracts a DatePatch containing the current values from a given Date.
 */
export function toPatch(date: Date): DatePatch {
	return {
		year: date.getFullYear(),
		month: date.getMonth(), // month number -1
		day: date.getDate(), // getDate, not getDay!!
		hours: date.getHours(),
		minutes: date.getMinutes(),
		seconds: date.getSeconds(),
		milliseconds: date.getMilliseconds(),
	};
}

/**
 * Produces a Date from the values of a given DatePatch.
 */
export function fromPatch(patch: DatePatch): Date {
	return new Date(
		patch.year ?? 0,
		patch.month ?? 0,
		patch.day ?? 0,
		patch.hours ?? 0,
		patch.minutes ?? 0,
		patch.seconds ?? 0,
		patch.milliseconds ?? 0,
	);
}

export interface DatePatch {
	year?: number,
	month?: number,
	day?: number,
	hours?: number,
	minutes?: number,
	seconds?: number,
	milliseconds?: number,
}
