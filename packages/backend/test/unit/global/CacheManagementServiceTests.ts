/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { MockRedis } from '../../misc/MockRedis.js';
import { GodOfTimeService } from '../../misc/GodOfTimeService.js';
import { MockInternalEventService } from '../../misc/MockInternalEventService.js';
import { CacheManagementService, type Manager, GC_INTERVAL } from '@/global/CacheManagementService.js';
import { MemoryKVCache } from '@/misc/cache.js';

describe(CacheManagementService, () => {
	let timeService: GodOfTimeService;
	let redisClient: MockRedis;
	let internalEventService: MockInternalEventService;

	let serviceUnderTest: CacheManagementService;
	let internalsUnderTest: { managedCaches: Set<Manager> };

	beforeAll(() => {
		timeService = new GodOfTimeService();
		redisClient = new MockRedis(timeService);
		internalEventService = new MockInternalEventService( { host: 'example.com' });
	});

	afterAll(() => {
		internalEventService.dispose();
		redisClient.disconnect();
	});

	beforeEach(() => {
		timeService.resetToNow();
		redisClient.mockReset();
		internalEventService.mockReset();

		serviceUnderTest = new CacheManagementService(redisClient, timeService, internalEventService);
		internalsUnderTest = { managedCaches: Reflect.get(serviceUnderTest, 'managedCaches') };
	});

	afterEach(() => {
		serviceUnderTest.dispose();
	});

	function createCache(): MemoryKVCache<string> {
		// Cast to allow access to managed functions, for spying purposes.
		return serviceUnderTest.createMemoryKVCache<string>('test', Infinity) as MemoryKVCache<string>;
	}

	describe('createMemoryKVCache', () => testCreate('createMemoryKVCache', 'memoryKV', { lifetime: Infinity }));
	describe('createMemorySingleCache', () => testCreate('createMemorySingleCache', 'memorySingle', { lifetime: Infinity }));
	describe('createRedisKVCache', () => testCreate('createRedisKVCache', 'redisKV', { lifetime: Infinity, memoryCacheLifetime: Infinity }));
	describe('createRedisSingleCache', () => testCreate('createRedisSingleCache', 'redisSingle', { lifetime: Infinity, memoryCacheLifetime: Infinity }));
	describe('createQuantumKVCache', () => testCreate('createQuantumKVCache', 'quantumKV', { lifetime: Infinity, fetcher: () => { throw new Error('not implement'); } }));

	describe('clear', () => {
		testClear('clear', false);
		testGC('clear', false, true, false);
	});
	describe('dispose', () => {
		testClear('dispose', true);
		testGC('dispose', false, false, true);
	});
	describe('onApplicationShutdown', () => {
		testClear('onApplicationShutdown', true);
		testGC('onApplicationShutdown', false, false, true);
	});
	describe('gc', () => testGC('gc', true, true, false));

	function testCreate<Func extends 'createMemoryKVCache' | 'createMemorySingleCache' | 'createRedisKVCache' | 'createRedisSingleCache' | 'createQuantumKVCache', Value>(func: Func, ...args: Parameters<CacheManagementService[Func]>) {
		// @ts-expect-error TypeScript bug: https://github.com/microsoft/TypeScript/issues/57322
		const act = () => serviceUnderTest[func]<Value>(...args);

		it('should construct a cache', () => {
			const cache = act();

			expect(cache).not.toBeNull();
		});

		it('should track reference', () => {
			const cache = act();

			expect(internalsUnderTest.managedCaches.values()).toContain(cache);
		});

		it('should start GC timer', () => {
			const cache = act();
			const gc = jest.spyOn(cache as unknown as { gc(): void }, 'gc');

			timeService.tick({ milliseconds: GC_INTERVAL * 3 });

			expect(gc).toHaveBeenCalledTimes(3);
		});

		it('should throw if name is duplicate', () => {
			act();

			expect(() => act()).toThrow();
		});
	}

	function testClear(func: 'clear' | 'dispose' | 'onApplicationShutdown', shouldDispose: boolean) {
		const act = async () => await serviceUnderTest[func]();

		it('should clear managed caches', async () => {
			const cache = createCache();
			const clear = jest.spyOn(cache, 'clear');

			await act();

			expect(clear).toHaveBeenCalled();
		});

		it(`should${shouldDispose ? ' ' : ' not '}dispose managed caches`, async () => {
			const cache = createCache();
			const dispose = jest.spyOn(cache, 'dispose');

			await act();

			if (shouldDispose) {
				expect(dispose).toHaveBeenCalled();
			} else {
				expect(dispose).not.toHaveBeenCalled();
			}
		});

		it('should not error with nothing to do', async () => {
			await act();
		});

		it('should be callable multiple times', async () => {
			const cache = createCache();
			const clear = jest.spyOn(cache, 'clear');

			await act();
			await act();
			await act();

			const expected = shouldDispose ? 1 : 3;
			expect(clear).toHaveBeenCalledTimes(expected);
		});

		it(`should${shouldDispose ? ' ' : ' not '}deref caches`, async () => {
			const cache = createCache();

			await act();

			if (shouldDispose) {
				expect(internalsUnderTest.managedCaches.values()).not.toContain(cache);
			} else {
				expect(internalsUnderTest.managedCaches.values()).toContain(cache);
			}
		});

		it(`should${shouldDispose ? ' ' : ' not '}reset cache list`, async () => {
			createCache();

			await act();

			if (shouldDispose) {
				expect(internalsUnderTest.managedCaches.size).toBe(0);
			} else {
				expect(internalsUnderTest.managedCaches.size).not.toBe(0);
			}
		});
	}

	function testGC(func: 'clear' | 'dispose' | 'onApplicationShutdown' | 'gc', shouldFire: boolean, shouldReset: boolean, shouldStop: boolean) {
		const expectedCalls =
			shouldStop
				? shouldFire
					? 1
					: 0
				: shouldFire
					? shouldReset
						? 2
						: 3
					: shouldReset
						? 1
						: 2
		;

		const testName = 'should ' + [
			shouldFire ? 'trigger' : 'not trigger',
			shouldReset ? 'reset' : 'not reset',
			shouldStop ? 'and stop' : 'and not stop',
		].join(', ') + ' GC';

		const arrange = () => jest.spyOn(createCache(), 'gc');
		const act = () => {
			timeService.tick({ milliseconds: GC_INTERVAL - 1 });
			serviceUnderTest[func]();
			timeService.tick({ milliseconds: 1 });
			timeService.tick({ milliseconds: GC_INTERVAL });
		};
		const assert = (spy: ReturnType<typeof arrange>) => {
			expect(spy).toHaveBeenCalledTimes(expectedCalls);
		};

		it(testName, () => {
			const spy = arrange();
			act();
			assert(spy);
		});
	}
});
