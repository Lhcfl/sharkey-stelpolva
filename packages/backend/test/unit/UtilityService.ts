import * as assert from 'assert';
import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';

import { CoreModule } from '@/core/CoreModule.js';
import { UtilityService } from '@/core/UtilityService.js';
import { MetaService } from '@/core/MetaService.js';
import { GlobalModule } from '@/GlobalModule.js';
import { MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import type { SoftwareSuspension } from '@/models/Meta.js';
import type { MiInstance } from '@/models/Instance.js';

describe('UtilityService', () => {
	let utilityService: UtilityService;
	let meta: jest.Mocked<MiMeta>;

	beforeAll(async () => {
		const app = await Test.createTestingModule({
			imports: [GlobalModule, CoreModule],
			providers: [MetaService],
		})
			.overrideProvider(MetaService).useValue({ fetch: jest.fn() })
			.compile();

		utilityService = app.get<UtilityService>(UtilityService);
		meta = app.get<MiMeta>(DI.meta) as jest.Mocked<MiMeta>;
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
				false, "semver can't parse softwareVersion",
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
});
