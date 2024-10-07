/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isSystemAccount } from '@/misc/is-system-account.js';

describe(isSystemAccount, () => {
	it('should return true for instance.actor', () => {
		expect(isSystemAccount({ username: 'instance.actor' })).toBeTruthy();
	});

	it('should return true for relay.actor', () => {
		expect(isSystemAccount({ username: 'relay.actor' })).toBeTruthy();
	});

	it('should return true for any username with a dot', () => {
		expect(isSystemAccount({ username: 'some.user' })).toBeTruthy();
		expect(isSystemAccount({ username: 'some.' })).toBeTruthy();
		expect(isSystemAccount({ username: '.user' })).toBeTruthy();
		expect(isSystemAccount({ username: '.' })).toBeTruthy();
	});

	it('should return true for usernames with multiple dots', () => {
		expect(isSystemAccount({ username: 'some.user.account' })).toBeTruthy();
		expect(isSystemAccount({ username: '..' })).toBeTruthy();
	});

	it('should return false for usernames without a dot', () => {
		expect(isSystemAccount({ username: 'instance_actor' })).toBeFalsy();
		expect(isSystemAccount({ username: 'instanceactor' })).toBeFalsy();
		expect(isSystemAccount({ username: 'relay_actor' })).toBeFalsy();
		expect(isSystemAccount({ username: 'relayactor' })).toBeFalsy();
		expect(isSystemAccount({ username: '' })).toBeFalsy();
	});
});
