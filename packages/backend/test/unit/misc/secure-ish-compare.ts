/*
 * SPDX-FileCopyrightText: dakkar and other sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { secureishCompare } from '@/misc/secure-ish-compare.js';

describe(secureishCompare, () => {
	it('should return true if strings are equal', () => {
		expect(secureishCompare('abc','abc')).toBe(true);
		expect(secureishCompare('aaa','aaa')).toBe(true);
	});
	it('should return false if strings are different', () => {
		expect(secureishCompare('abc','def')).toBe(false);
	});
	it('should return false if one is prefix of the other', () => {
		expect(secureishCompare('abc','abcabc')).toBe(false);
		expect(secureishCompare('abcabc','abc')).toBe(false);
		expect(secureishCompare('aaa','aa')).toBe(false);
	});
	it('should return false if strings are very different', () => {
		expect(secureishCompare('abc','defghi')).toBe(false);
		expect(secureishCompare('defghi','abc')).toBe(false);
	});
});
