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
		expect(assertOne({ type: 'Test', id: 'bad' })).toThrow(/bad Activity/);
		expect(assertOne({ type: 'Test', id: 'good' })).not.toThrow();
	});

	test('simple url', () => {
		expect(assertOne({ type: 'Test', url: 'bad' })).toThrow(/bad Activity/);
		expect(assertOne({ type: 'Test', url: 'good' })).not.toThrow();
	});

	test('array of urls', () => {
		expect(assertOne({ type: 'Test', url: ['bad'] })).toThrow(/bad Activity/);
		expect(assertOne({ type: 'Test', url: ['bad', 'other'] })).toThrow(/bad Activity/);
		expect(assertOne({ type: 'Test', url: ['good'] })).not.toThrow();
		expect(assertOne({ type: 'Test', url: ['bad', 'good'] })).not.toThrow();
	});

	test('array of objects', () => {
		expect(assertOne({ type: 'Test', url: [{ type: 'Test', href: 'bad' }] })).toThrow(/bad Activity/);
		expect(assertOne({ type: 'Test', url: [{ type: 'Test', href: 'bad' }, { type: 'Test', href: 'other' }] })).toThrow(/bad Activity/);
		expect(assertOne({ type: 'Test', url: [{ type: 'Test', href: 'good' }] })).not.toThrow();
		expect(assertOne({ type: 'Test', url: [{ type: 'Test', href: 'bad' }, { type: 'Test', href: 'good' }] })).not.toThrow();
	});

	test('mixed array', () => {
		expect(assertOne({ type: 'Test', url: [{ type: 'Test', href: 'bad' }, 'other'] })).toThrow(/bad Activity/);
		expect(assertOne({ type: 'Test', url: [{ type: 'Test', href: 'bad' }, 'good'] })).not.toThrow();
		expect(assertOne({ type: 'Test', url: ['bad', { type: 'Test', href: 'good' }] })).not.toThrow();
	});

	test('id and url', () => {
		expect(assertOne({ type: 'Test', id: 'other', url: 'bad' })).toThrow(/bad Activity/);
		expect(assertOne({ type: 'Test', id: 'bad', url: 'good' })).not.toThrow();
		expect(assertOne({ type: 'Test', id: 'good', url: 'bad' })).not.toThrow();
	});
});
