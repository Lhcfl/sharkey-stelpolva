/*
 * SPDX-FileCopyrightText: dakkar and sharkey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { IObject } from '@/core/activitypub/type.js';
import { describe, expect, test } from '@jest/globals';
import { assertActivityMatchesUrls } from '@/core/activitypub/misc/check-against-url.js';

function assertOne(activity: IObject) {
	// return a function so we can use `.toThrow`
	return () => assertActivityMatchesUrls(activity, ['good']);
}

describe('assertActivityMatchesUrls', () => {
	test('id', () => {
		expect(assertOne({ id: 'bad' })).toThrow(/bad Activity/);
		expect(assertOne({ id: 'good' })).not.toThrow();
	});

	test('simple url', () => {
		expect(assertOne({ url: 'bad' })).toThrow(/bad Activity/);
		expect(assertOne({ url: 'good' })).not.toThrow();
	});

	test('array of urls', () => {
		expect(assertOne({ url: ['bad'] })).toThrow(/bad Activity/);
		expect(assertOne({ url: ['bad', 'other'] })).toThrow(/bad Activity/);
		expect(assertOne({ url: ['good'] })).not.toThrow();
		expect(assertOne({ url: ['bad', 'good'] })).not.toThrow();
	});

	test('array of objects', () => {
		expect(assertOne({ url: [{ href: 'bad' }] })).toThrow(/bad Activity/);
		expect(assertOne({ url: [{ href: 'bad' }, { href: 'other' }] })).toThrow(/bad Activity/);
		expect(assertOne({ url: [{ href: 'good' }] })).not.toThrow();
		expect(assertOne({ url: [{ href: 'bad' }, { href: 'good' }] })).not.toThrow();
	});

	test('mixed array', () => {
		expect(assertOne({ url: [{ href: 'bad' }, 'other'] })).toThrow(/bad Activity/);
		expect(assertOne({ url: [{ href: 'bad' }, 'good'] })).not.toThrow();
		expect(assertOne({ url: ['bad', { href: 'good' }] })).not.toThrow();
	});

	test('id and url', () => {
		expect(assertOne({ id: 'other', url: 'bad' })).toThrow(/bad Activity/);
		expect(assertOne({ id: 'bad', url: 'good' })).not.toThrow();
		expect(assertOne({ id: 'good', url: 'bad' })).not.toThrow();
	});
});
