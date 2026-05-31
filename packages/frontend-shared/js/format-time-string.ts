/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@@/js/config.js';

const defaultLocaleStringFormats: { [index: string]: string } = {
	'weekday': 'narrow',
	'era': 'narrow',
	'year': 'numeric',
	'month': 'numeric',
	'day': 'numeric',
	'hour': 'numeric',
	'minute': 'numeric',
	'second': 'numeric',
	'timeZoneName': 'short',
};

function formatLocaleString(date: Date, format: string): string {
	return format.replace(/\{\{(\w+)(:(\w+))?\}\}/g, (match: string, kind: string, _?: unknown, option?: string) => {
		if (['weekday', 'era', 'year', 'month', 'day', 'hour', 'minute', 'second', 'timeZoneName'].includes(kind)) {
			return date.toLocaleString(window.navigator.language, { [kind]: option ? option : defaultLocaleStringFormats[kind] });
		} else {
			return match;
		}
	});
}

export function formatDateTimeString(date: Date, format: string): string {
	return format
		.replace(/yyyy/g, date.getFullYear().toString())
		.replace(/yy/g, date.getFullYear().toString().slice(-2))
		.replace(/MMMM/g, date.toLocaleString(window.navigator.language, { month: 'long' }))
		.replace(/MMM/g, date.toLocaleString(window.navigator.language, { month: 'short' }))
		.replace(/MM/g, (`0${date.getMonth() + 1}`).slice(-2))
		.replace(/M/g, (date.getMonth() + 1).toString())
		.replace(/dd/g, (`0${date.getDate()}`).slice(-2))
		.replace(/d/g, date.getDate().toString())
		.replace(/HH/g, (`0${date.getHours()}`).slice(-2))
		.replace(/H/g, date.getHours().toString())
		.replace(/hh/g, (`0${(date.getHours() % 12) || 12}`).slice(-2))
		.replace(/h/g, ((date.getHours() % 12) || 12).toString())
		.replace(/mm/g, (`0${date.getMinutes()}`).slice(-2))
		.replace(/m/g, date.getMinutes().toString())
		.replace(/ss/g, (`0${date.getSeconds()}`).slice(-2))
		.replace(/s/g, date.getSeconds().toString())
		.replace(/tt/g, date.getHours() >= 12 ? 'PM' : 'AM');
}

export function formatTimeString(date: Date, format: string): string {
	return format.replace(/\[(([^\[]|\[\])*)\]|(([yMdHhmst])\4{0,3})/g, (match: string, localeformat?: string, _?: unknown, datetimeformat?: string) => {
		if (localeformat) return formatLocaleString(date, localeformat);
		if (datetimeformat) return formatDateTimeString(date, datetimeformat);
		return match;
	});
}

export const OneMilli = 1;
export const OneSecond = OneMilli * 1000;
export const OneMinute = OneSecond * 60;
export const OneHour = OneMinute * 60;
export const OneDay = OneHour * 24;
export const OneWeek = OneDay * 7;
export const OneMonth = OneDay * 30;
export const OneYear = OneDay * 365;

// TODO should we restore millis, since MkTime relies on this table?
export const timeBreakpoints = {
	now: 0,
	seconds: OneSecond,
	minutes: OneMinute,
	hours: OneHour,
	days: OneDay,
	weeks: OneWeek,
	months: OneMonth,
	years: OneYear,
	never: Infinity,
} as const;

export function breakTime(millis: number): TimeBreakpoint {
	millis = Math.abs(Math.round(millis));
	if (!Number.isFinite(millis)) {
		return 'never';
	}

	for (const bp of ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'now'] as const) {
		if (millis >= timeBreakpoints[bp]) {
			return bp;
		}
	}

	// This really shouldn't happen...
	return 'years';
}

export const timeTables = {
	in: {
		now: () => i18n.ts._timeIn.now,
		seconds: msLater => i18n.tsx._timeIn.seconds({ n: Math.round(msLater / OneSecond).toString() }),
		minutes: msLater => i18n.tsx._timeIn.minutes({ n: Math.round(msLater / OneMinute).toString() }),
		hours: msLater => i18n.tsx._timeIn.hours({ n: Math.round(msLater / OneHour).toString() }),
		days: msLater => i18n.tsx._timeIn.days({ n: Math.round(msLater / OneDay).toString() }),
		weeks: msLater => i18n.tsx._timeIn.weeks({ n: Math.round(msLater / OneWeek).toString() }),
		months: msLater => i18n.tsx._timeIn.months({ n: Math.round(msLater / OneMonth).toString() }),
		years: msLater => i18n.tsx._timeIn.years({ n: Math.round(msLater / OneYear).toString() }),
		never: () => i18n.ts._timeIn.never,
	} satisfies TimeTable,
	ago: {
		now: () => i18n.ts._timeIn.now,
		seconds: msAgo => i18n.tsx._ago.secondsAgo({ n: Math.round(msAgo / OneSecond).toString() }),
		minutes: msAgo => i18n.tsx._ago.minutesAgo({ n: Math.round(msAgo / OneMinute).toString() }),
		hours: msAgo => i18n.tsx._ago.hoursAgo({ n: Math.round(msAgo / OneHour).toString() }),
		days: msAgo => i18n.tsx._ago.daysAgo({ n: Math.round(msAgo / OneDay).toString() }),
		weeks: msAgo => i18n.tsx._ago.weeksAgo({ n: Math.round(msAgo / OneWeek).toString() }),
		months: msAgo => i18n.tsx._ago.monthsAgo({ n: Math.round(msAgo / OneMonth).toString() }),
		years: msAgo => i18n.tsx._ago.yearsAgo({ n: Math.round(msAgo / OneYear).toString() }),
		never: () => i18n.ts._ago.never,
	} satisfies TimeTable,
} as const;

export type TimeBreakpoint = keyof typeof timeBreakpoints;
export type TimeFunc = (millis: number) => string;
export type TimeTable = Record<TimeBreakpoint, TimeFunc>;

export function getRelativeTime(
	input: { ago: number } | { agoSec: number } | { agoMs: number } | { then: Date, now?: Date },
	opts?: { nowText?: string },
): string {
	// how long ago (in milliseconds) was the specified time?
	const msAgo =
		'agoMs' in input ? input.agoMs :
		'agoSec' in input ? (input.agoSec * 1000) :
		'ago' in input ? (input.ago * 1000) :
		(input.now?.getTime() ?? Date.now()) - input.then.getTime();

	const millis = Math.abs(Math.round(msAgo));

	// Special "fuzzy" logic when time gets close to zero.
	if (millis <= 3 * OneSecond) {
		return opts?.nowText ?? i18n.ts._timeIn.now;
	}

	// Otherwise, use the table funcs
	return timeTables[msAgo > 0 ? 'ago' : 'in'][breakTime(millis)](millis);
}
