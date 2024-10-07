/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isSystemAccount } from '@/misc/is-system-account.js';

describe(isSystemAccount, () => {
	it('should return true for instance.actor', () => {
		expect(isSystemAccount({ username: 'instance.actor', host: null })).toBeTruthy();
	});

	it('should return true for relay.actor', () => {
		expect(isSystemAccount({ username: 'relay.actor', host: null })).toBeTruthy();
	});

	it('should return true for any username with a dot', () => {
		expect(isSystemAccount({ username: 'some.user', host: null })).toBeTruthy();
		expect(isSystemAccount({ username: 'some.', host: null })).toBeTruthy();
		expect(isSystemAccount({ username: '.user', host: null })).toBeTruthy();
		expect(isSystemAccount({ username: '.', host: null })).toBeTruthy();
	});

	it('should return true for usernames with multiple dots', () => {
		expect(isSystemAccount({ username: 'some.user.account', host: null })).toBeTruthy();
		expect(isSystemAccount({ username: '..', host: null })).toBeTruthy();
	});

	it('should return false for usernames without a dot', () => {
		expect(isSystemAccount({ username: 'instance_actor', host: null })).toBeFalsy();
		expect(isSystemAccount({ username: 'instanceactor', host: null })).toBeFalsy();
		expect(isSystemAccount({ username: 'relay_actor', host: null })).toBeFalsy();
		expect(isSystemAccount({ username: 'relayactor', host: null })).toBeFalsy();
		expect(isSystemAccount({ username: '', host: null })).toBeFalsy();
	});

	it('should return false for users from another instance', () => {
		expect(isSystemAccount({ username: 'instance.actor', host: 'example.com' })).toBeFalsy();
		expect(isSystemAccount({ username: 'relay.actor', host: 'example.com' })).toBeFalsy();
		expect(isSystemAccount({ username: 'some.user', host: 'example.com' })).toBeFalsy();
		expect(isSystemAccount({ username: 'some.', host: 'example.com' })).toBeFalsy();
		expect(isSystemAccount({ username: '.user', host: 'example.com' })).toBeFalsy();
		expect(isSystemAccount({ username: '.', host: 'example.com' })).toBeFalsy();
		expect(isSystemAccount({ username: 'some.user.account', host: 'example.com' })).toBeFalsy();
		expect(isSystemAccount({ username: '..', host: 'example.com' })).toBeFalsy();
	});
});
