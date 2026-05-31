/*
 * SPDX-FileCopyrightText: dakkar and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'assert';
import type { MiMeta } from '@/models/_.js';
import type { Config } from '@/config.js';
import type { SoftwareSuspension } from '@/models/Meta.js';
import type { MiInstance } from '@/models/Instance.js';
import { UtilityService } from '@/core/UtilityService.js';
import { EnvService } from '@/global/EnvService.js';

describe('UtilityService', () => {
	let utilityService: UtilityService;
	let meta: MiMeta;

	beforeEach(() => {
		const config = {
			url: 'https://example.com',
			host: 'example.com',
			id: 'aidx',
		} as unknown as Config;

		meta = {
			blockedHosts: [],
			silencedHosts: [],
			mediaSilencedHosts: [],
			federationHosts: [],
			bubbleInstances: [],
			deliverSuspendedSoftware: [],
			federation: 'all',
		} as unknown as MiMeta;

		const envService = new EnvService();
		utilityService = new UtilityService(config, meta, envService);
	});

	describe('punyHost', () => {
		test('simple', () => {
			assert.equal(utilityService.punyHost('http://www.foo.com'), 'www.foo.com');
		});
		test('japanese', () => {
			assert.equal(utilityService.punyHost('http://www.新聞.com'), 'www.xn--efvv70d.com');
		});
		test('simple, with port', () => {
			assert.equal(utilityService.punyHost('http://www.foo.com:3000'), 'www.foo.com:3000');
		});
		test('japanese, with port', () => {
			assert.equal(utilityService.punyHost('http://www.新聞.com:3000'), 'www.xn--efvv70d.com:3000');
		});
	});

	describe('punyHostPSLDomain', () => {
		test('simple', () => {
			assert.equal(utilityService.punyHostPSLDomain('http://www.foo.com'), 'foo.com');
		});
		test('japanese', () => {
			assert.equal(utilityService.punyHostPSLDomain('http://www.新聞.com'), 'xn--efvv70d.com');
		});
		test('simple, with port', () => {
			assert.equal(utilityService.punyHostPSLDomain('http://www.foo.com:3000'), 'foo.com:3000');
		});
		test('japanese, with port', () => {
			assert.equal(utilityService.punyHostPSLDomain('http://www.新聞.com:3000'), 'xn--efvv70d.com:3000');
		});
		test('lower', () => {
			assert.equal(utilityService.punyHostPSLDomain('http://foo.github.io'), 'foo.github.io');
			assert.equal(utilityService.punyHostPSLDomain('http://foo.bar.github.io'), 'bar.github.io');
		});
		test('special', () => {
			assert.equal(utilityService.punyHostPSLDomain('http://foo.masto.host'), 'foo.masto.host');
			assert.equal(utilityService.punyHostPSLDomain('http://foo.bar.masto.host'), 'bar.masto.host');
		});
	});

	describe('toPuny', () => {
		test('without port ', () => {
			assert.equal(utilityService.toPuny('www.foo.com'), 'www.foo.com');
		});
		test('with port ', () => {
			assert.equal(utilityService.toPuny('www.foo.com:3000'), 'www.foo.com:3000');
		});
	});

	describe('isDeliverSuspendedSoftware', () => {
		function checkThis(rules: SoftwareSuspension[], target: Pick<MiInstance, 'softwareName' | 'softwareVersion'>, expect: boolean, message: string) {
			meta.deliverSuspendedSoftware = rules;
			const match = !!utilityService.isDeliverSuspendedSoftware(target);
			assert.equal(match, expect, message);
		}

		test('equality', () => {
			checkThis(
				[{ software: 'Test', versionRange: '1.2.3' }],
				{ softwareName: 'Test', softwareVersion: '1.2.3' },
				true, 'straight match',
			);
		});

		test('normal version', () => {
			checkThis(
				[{ software: 'Test', versionRange: '1.2.3-pre' }],
				{ softwareName: 'Test', softwareVersion: '1.2.3-pre+g1234' },
				true, 'straight match',
			);
			checkThis(
				[{ software: 'Test', versionRange: '1.2.3' }],
				{ softwareName: 'Test', softwareVersion: '1.2.3-pre+g1234' },
				false, 'pre-release',
			);
			checkThis(
				[{ software: 'Test', versionRange: '>= 1.0.0 < 2.0.0' }],
				{ softwareName: 'Test', softwareVersion: '1.2.3-pre+g1234' },
				true, 'range',
			);
			checkThis(
				[{ software: 'Test', versionRange: '*' }],
				{ softwareName: 'Test', softwareVersion: '1.2.3-pre+g1234' },
				true, 'asterisk',
			);
			checkThis(
				[{ software: 'Test', versionRange: '/.*/' }],
				{ softwareName: 'Test', softwareVersion: '1.2.3-pre+g1234' },
				true, 'regexp matching anything',
			);
			checkThis(
				[{ software: 'Test', versionRange: '/-pre\\b/' }],
				{ softwareName: 'Test', softwareVersion: '1.2.3-pre+g1234' },
				true, 'regexp matching the version',
			);
		});

		test('no version', () => {
			checkThis(
				[{ software: 'Test', versionRange: '1.2.3' }],
				{ softwareName: 'Test', softwareVersion: null },
				false, 'semver',
			);
			checkThis(
				[{ software: 'Test', versionRange: '*' }],
				{ softwareName: 'Test', softwareVersion: null },
				true, 'asterisk',
			);
			checkThis(
				[{ software: 'Test', versionRange: '/^$/' }],
				{ softwareName: 'Test', softwareVersion: null },
				true, 'regexp matching empty string',
			);
			checkThis(
				[{ software: 'Test', versionRange: '/.*/' }],
				{ softwareName: 'Test', softwareVersion: null },
				true, 'regexp matching anything',
			);
		});

		test('bad version', () => {
			checkThis(
				[{ software: 'Test', versionRange: '1.2.3' }],
				{ softwareName: 'Test', softwareVersion: '1-2-3' },
				false, 'semver can\'t parse softwareVersion',
			);
			checkThis(
				[{ software: 'Test', versionRange: '*' }],
				{ softwareName: 'Test', softwareVersion: '1-2-3' },
				true, 'asterisk',
			);
			checkThis(
				[{ software: 'Test', versionRange: '/.*/' }],
				{ softwareName: 'Test', softwareVersion: '1-2-3' },
				true, 'regexp matching anything',
			);
			checkThis(
				[{ software: 'Test', versionRange: '/^1-2-/' }],
				{ softwareName: 'Test', softwareVersion: '1-2-3' },
				true, 'regexp matching the version',
			);
		});
	});

	describe('parseAcct', () => {
		test('should accept string', () => {
			const input = 'user@1.example.com';
			const result = utilityService.parseAcct(input);
			expect(result).toEqual({
				username: 'user',
				host: '1.example.com',
			});
		});

		test('should accept object', () => {
			const input = {
				username: 'user',
				host: '1.example.com',
			};
			const result = utilityService.parseAcct(input);
			expect(result).toEqual({
				username: 'user',
				host: '1.example.com',
			});
		});

		test('should normalize leading @', () => {
			const input = '@user@1.example.com';
			const result = utilityService.parseAcct(input);
			expect(result).toEqual({
				username: 'user',
				host: '1.example.com',
			});
		});

		test('should normalize capital host', () => {
			const input = 'user@1.EXAMPLE.com';
			const result = utilityService.parseAcct(input);
			expect(result).toEqual({
				username: 'user',
				host: '1.example.com',
			});
		});

		// TODO find an example
		// test('should normalize unicode host', () => {
		//
		// });

		test('should normalize local host', () => {
			const input = 'user@example.com';
			const result = utilityService.parseAcct(input);
			expect(result).toEqual({
				username: 'user',
				host: null,
			});
		});

		test('should normalize custom local host', () => {
			const input = 'user';
			const result = utilityService.parseAcct(input, undefined, '1.example.com');
			expect(result).toEqual({
				username: 'user',
				host: '1.example.com',
			});
		});

		test('should normalize username', () => {
			const input = 'UsEr@1.example.com';
			const result = utilityService.parseAcct(input);
			expect(result).toEqual({
				username: 'user',
				host: '1.example.com',
			});
		});

		test('should preserve username when usernameLower is false', () => {
			const input = 'UsEr@1.example.com';
			const result = utilityService.parseAcct(input, false);
			expect(result).toEqual({
				username: 'UsEr',
				host: '1.example.com',
			});
		});
	});
});
