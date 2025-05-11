import * as assert from 'assert';
import { Test } from '@nestjs/testing';

import { CoreModule } from '@/core/CoreModule.js';
import { UtilityService } from '@/core/UtilityService.js';
import { GlobalModule } from '@/GlobalModule.js';

describe('UtilityService', () => {
	let utilityService: UtilityService;

	beforeAll(async () => {
		const app = await Test.createTestingModule({
			imports: [GlobalModule, CoreModule],
		}).compile();
		utilityService = app.get<UtilityService>(UtilityService);
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
});
