/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { IObject } from '@/core/activitypub/type.js';
import type { EnvService } from '@/core/EnvService.js';
import type { MiMeta } from '@/models/Meta.js';
import type { Config } from '@/config.js';
import type { LoggerService } from '@/core/LoggerService.js';
import Logger from '@/logger.js';
import { ApUtilityService } from '@/core/activitypub/ApUtilityService.js';
import { UtilityService } from '@/core/UtilityService.js';

describe(ApUtilityService, () => {
	let serviceUnderTest: ApUtilityService;
	let env: Record<string, string>;

	beforeEach(() => {
		env = {};
		const envService = {
			env,
		} as unknown as EnvService;

		const config = {
			host: 'example.com',
			blockedHosts: [],
			silencedHosts: [],
			mediaSilencedHosts: [],
			federationHosts: [],
			bubbleInstances: [],
			deliverSuspendedSoftware: [],
			federation: 'all',
		} as unknown as Config;
		const meta = {

		} as MiMeta;

		const utilityService = new UtilityService(config, meta, envService);

		const loggerService = {
			getLogger(domain: string) {
				const logger = new Logger(domain);
				Object.defineProperty(logger, 'log', {
					value: () => {},
				});
				return logger;
			},
		} as unknown as LoggerService;

		serviceUnderTest = new ApUtilityService(utilityService, loggerService);
	});

	describe('assertIdMatchesUrlAuthority', () => {
		it('should return when input matches', () => {
			const object = { id: 'https://first.example.com' } as IObject;
			const url = 'https://second.example.com';

			expect(() => {
				serviceUnderTest.assertIdMatchesUrlAuthority(object, url);
			}).not.toThrow();
		});

		it('should throw when id is missing', () => {
			const object = { id: undefined } as IObject;
			const url = 'https://second.example.com';

			expect(() => {
				serviceUnderTest.assertIdMatchesUrlAuthority(object, url);
			}).toThrow();
		});

		it('should throw when id does not match', () => {
			const object = { id: 'https://other-domain.com' } as IObject;
			const url = 'https://second.example.com';

			expect(() => {
				serviceUnderTest.assertIdMatchesUrlAuthority(object, url);
			}).toThrow();
		});
	});

	describe('haveSameAuthority', () => {
		it('should return true when URLs match', () => {
			const url = 'https://example.com';

			const result = serviceUnderTest.haveSameAuthority(url, url);

			expect(result).toBeTruthy();
		});

		it('should return true when URLs have same host', () => {
			const first = 'https://example.com/first';
			const second = 'https://example.com/second';

			const result = serviceUnderTest.haveSameAuthority(first, second);

			expect(result).toBeTruthy();
		});

		it('should return true when URLs have same authority', () => {
			const first = 'https://first.example.com/first';
			const second = 'https://second.example.com/second';

			const result = serviceUnderTest.haveSameAuthority(first, second);

			expect(result).toBeTruthy();
		});

		it('should return false when URLs have different authority', () => {
			const first = 'https://first.com';
			const second = 'https://second.com';

			const result = serviceUnderTest.haveSameAuthority(first, second);

			expect(result).toBeFalsy();
		});
	});

	describe('findBestObjectUrl', () => {
		it('should return null when input is undefined', () => {
			const object = {
				id: 'https://example.com',
				url: undefined,
			} as IObject;

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBeNull();
		});

		it('should return null when input is empty array', () => {
			const object = {
				id: 'https://example.com',
				url: [] as string[],
			} as IObject;

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBeNull();
		});

		it('should return return url if string input matches', () => {
			const object = {
				id: 'https://example.com/1',
				url: 'https://example.com/2',
			} as IObject;

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBe('https://example.com/2');
		});

		it('should return return url if object input matches', () => {
			const object = {
				id: 'https://example.com/1',
				url: {
					href: 'https://example.com/2',
				} as IObject,
			} as IObject;

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBe('https://example.com/2');
		});

		it('should return return url if string[] input matches', () => {
			const object = {
				id: 'https://example.com/1',
				url: ['https://example.com/2'],
			} as IObject;

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBe('https://example.com/2');
		});

		it('should return return url if object[] input matches', () => {
			const object = {
				id: 'https://example.com/1',
				url: [{
					href: 'https://example.com/2',
				} as IObject],
			} as IObject;

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBe('https://example.com/2');
		});

		it('should skip invalid entries', () => {
			const object = {
				id: 'https://example.com/1',
				url: [{} as IObject, 'https://example.com/2'],
			} as IObject;

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBe('https://example.com/2');
		});

		it('should allow empty mediaType', () => {
			const object = {
				id: 'https://example.com/1',
				url: {
					href: 'https://example.com/2',
				} as IObject,
			} as IObject;

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBe('https://example.com/2');
		});

		it('should allow text/html mediaType', () => {
			const object = {
				id: 'https://example.com/1',
				url: {
					href: 'https://example.com/2',
					mediaType: 'text/html',
				} as IObject,
			} as IObject;

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBe('https://example.com/2');
		});

		it('should allow other text/ mediaTypes', () => {
			const object = {
				id: 'https://example.com/1',
				url: {
					href: 'https://example.com/2',
					mediaType: 'text/imaginary',
				} as IObject,
			} as IObject;

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBe('https://example.com/2');
		});

		it('should allow application/ld+json mediaType', () => {
			const object = {
				id: 'https://example.com/1',
				url: {
					href: 'https://example.com/2',
					mediaType: 'application/ld+json;profile=https://www.w3.org/ns/activitystreams',
				} as IObject,
			} as IObject;

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBe('https://example.com/2');
		});

		it('should allow application/activity+json mediaType', () => {
			const object = {
				id: 'https://example.com/1',
				url: {
					href: 'https://example.com/2',
					mediaType: 'application/activity+json',
				} as IObject,
			} as IObject;

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBe('https://example.com/2');
		});

		it('should reject other mediaTypes', () => {
			const object = {
				id: 'https://example.com/1',
				url: [
					{
						href: 'https://example.com/2',
						mediaType: 'application/json',
					} as IObject,
					{
						href: 'https://example.com/3',
						mediaType: 'image/jpeg',
					} as IObject,
				],
			} as IObject;

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBeNull();
		});

		it('should return best match', () => {
			const object = {
				id: 'https://example.com/1',
				url: [
					'https://example.com/2',
					{
						href: 'https://example.com/3',
					} as IObject,
					{
						href: 'https://example.com/4',
						mediaType: 'text/html',
					} as IObject,
					{
						href: 'https://example.com/5',
						mediaType: 'text/plain',
					} as IObject,
					{
						href: 'https://example.com/6',
						mediaType: 'application/ld+json',
					} as IObject,
					{
						href: 'https://example.com/7',
						mediaType: 'application/activity+json',
					} as IObject,
					{
						href: 'https://example.com/8',
						mediaType: 'image/jpeg',
					} as IObject,
				],
			} as IObject;

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBe('https://example.com/4');
		});

		it('should return first match in case of ties', () => {
			const object = {
				id: 'https://example.com/1',
				url: ['https://example.com/2', 'https://example.com/3'],
			} as IObject;

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBe('https://example.com/2');
		});

		it('should skip invalid scheme', () => {
			const object = {
				id: 'https://example.com/1',
				url: ['file://example.com/1', 'https://example.com/2'],
			} as IObject;

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBe('https://example.com/2');
		});

		it('should skip HTTP in production', () => {
			// noinspection HttpUrlsUsage
			const object = {
				id: 'https://example.com/1',
				url: ['http://example.com/1', 'https://example.com/2'],
			} as IObject;
			env.NODE_ENV = 'production';

			const result = serviceUnderTest.findBestObjectUrl(object);

			expect(result).toBe('https://example.com/2');
		});

		it('should allow HTTP in non-prod', () => {
			// noinspection HttpUrlsUsage
			const object = {
				id: 'https://example.com/1',
				url: ['http://example.com/1', 'https://example.com/2'],
			} as IObject;
			env.NODE_ENV = 'test';

			const result = serviceUnderTest.findBestObjectUrl(object);

			// noinspection HttpUrlsUsage
			expect(result).toBe('http://example.com/1');
		});
	});

	describe('sanitizeInlineObject', () => {
		it('should exclude nested arrays', () => {
			const input = {
				test: [[]] as unknown as string[],
			};

			const result = serviceUnderTest.sanitizeInlineObject(input, 'test', 'https://example.com/actor', 'example.com');

			expect(result).toBe(false);
		});

		it('should exclude incorrect type', () => {
			const input = {
				test: 0 as unknown as string,
			};

			const result = serviceUnderTest.sanitizeInlineObject(input, 'test', 'https://example.com/actor', 'example.com');

			expect(result).toBe(false);
		});

		it('should exclude missing ID', () => {
			const input = {
				test: {
					id: undefined,
				},
			};

			const result = serviceUnderTest.sanitizeInlineObject(input, 'test', 'https://example.com/actor', 'example.com');

			expect(result).toBe(false);
		});

		it('should exclude wrong host', () => {
			const input = {
				test: 'https://wrong.com/object',
			};

			const result = serviceUnderTest.sanitizeInlineObject(input, 'test', 'https://example.com/actor', 'example.com');

			expect(result).toBe(false);
		});

		it('should exclude invalid URLs', () => {
			const input = {
				test: 'https://user@example.com/object',
			};

			const result = serviceUnderTest.sanitizeInlineObject(input, 'test', 'https://example.com/actor', 'example.com');

			expect(result).toBe(false);
		});

		it('should accept string', () => {
			const input = {
				test: 'https://example.com/object',
			};

			const result = serviceUnderTest.sanitizeInlineObject(input, 'test', 'https://example.com/actor', 'example.com');

			expect(result).toBe(true);
		});

		it('should accept array of string', () => {
			const input = {
				test: ['https://example.com/object'],
			};

			const result = serviceUnderTest.sanitizeInlineObject(input, 'test', 'https://example.com/actor', 'example.com');

			expect(result).toBe(true);
		});

		it('should accept object', () => {
			const input = {
				test: {
					id: 'https://example.com/object',
				},
			};

			const result = serviceUnderTest.sanitizeInlineObject(input, 'test', 'https://example.com/actor', 'example.com');

			expect(result).toBe(true);
		});

		it('should accept array of object', () => {
			const input = {
				test: [{
					id: 'https://example.com/object',
				}],
			};

			const result = serviceUnderTest.sanitizeInlineObject(input, 'test', 'https://example.com/actor', 'example.com');

			expect(result).toBe(true);
		});
	});
});
