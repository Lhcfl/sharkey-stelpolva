/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { MockRedis } from '../../misc/MockRedis.js';
import { MockConsole } from '../../misc/MockConsole.js';
import { GodOfTimeService } from '../../misc/GodOfTimeService.js';
import { MockInternalEventService } from '../../misc/MockInternalEventService.js';
import { MockEnvService } from '../../misc/MockEnvService.js';
import type { Logger } from '@/logger.js';
import {
	CacheManagementService,
	GC_INTERVAL,
	type CacheManager,
	type QueueManager,
} from '@/global/CacheManagementService.js';
import { MemoryKVCache } from '@/misc/cache.js';
import { LoggerService } from '@/core/LoggerService.js';

describe(CacheManagementService, () => {
	let mockTimeService: GodOfTimeService;
	let mockRedisClient: MockRedis;
	let mockInternalEventService: MockInternalEventService;
	let mockConsole: MockConsole;
	let mockEnvService: MockEnvService;
	let fakeGlobalLogger: Logger;

	let serviceUnderTest: CacheManagementService;
	let internalsUnderTest: { managedCaches: Map<string, CacheManager>, managedQueues: Map<string, QueueManager> };

	beforeAll(() => {
		mockTimeService = new GodOfTimeService();
		mockRedisClient = new MockRedis(mockTimeService);
		mockConsole = new MockConsole();
		mockEnvService = new MockEnvService();
		mockInternalEventService = MockInternalEventService.create({
			timeService: mockTimeService,
			redisForPub: mockRedisClient,
			redisForSub: mockRedisClient,
		});

		const loggerService = new LoggerService(mockConsole, mockTimeService, mockEnvService);
		fakeGlobalLogger = loggerService.getLogger('global');
	});

	afterAll(() => {
		mockInternalEventService.dispose();
		mockRedisClient.disconnect();
	});

	beforeEach(() => {
		mockTimeService.resetToNow();
		mockRedisClient.mockReset();
		mockInternalEventService.mockReset();
		mockEnvService.mockReset();
		mockConsole.mockReset();

		serviceUnderTest = new CacheManagementService(mockRedisClient, mockTimeService, mockInternalEventService, fakeGlobalLogger);
		internalsUnderTest = {
			get managedCaches() { return Reflect.get(serviceUnderTest, 'managedCaches'); },
			get managedQueues() { return Reflect.get(serviceUnderTest, 'managedQueues'); },
		};
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
	describe('createCollapsedQueue', () => testCreate('createCollapsedQueue', 'collapsedQueue', { timeout: Infinity, collapse: a => a, perform: () => { throw new Error('not implement'); } }));

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

	function testCreate<Func extends 'createMemoryKVCache' | 'createMemorySingleCache' | 'createRedisKVCache' | 'createRedisSingleCache' | 'createQuantumKVCache' | 'createCollapsedQueue', Value>(func: Func, ...args: Parameters<CacheManagementService[Func]>) {
		// @ts-expect-error TypeScript bug: https://github.com/microsoft/TypeScript/issues/57322
		const act = () => serviceUnderTest[func]<Value>(...args);

		it('should construct a cache', () => {
			const cache = act();

			expect(cache).not.toBeNull();
		});

		it('should track reference', () => {
			const cache = act();

			const allTracked = [...internalsUnderTest.managedCaches.values(), ...internalsUnderTest.managedQueues.values()];
			expect(allTracked).toContain(cache);
		});

		it('should start GC timer', async () => {
			const cache = act();

			// Queues don't have a GC method, so there's nothing to test
			if (!Reflect.has(cache, 'gc')) return;

			const gc = jest.spyOn(cache as unknown as { gc(): Promise<void> }, 'gc');

			mockTimeService.tick({ milliseconds: GC_INTERVAL * 3 });

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
		const act = async () => {
			mockTimeService.tick({ milliseconds: GC_INTERVAL - 1 });
			await serviceUnderTest[func]();
			mockTimeService.tick({ milliseconds: 1 });
			mockTimeService.tick({ milliseconds: GC_INTERVAL });
		};
		const assert = (spy: ReturnType<typeof arrange>) => {
			expect(spy).toHaveBeenCalledTimes(expectedCalls);
		};

		it(testName, async () => {
			const spy = arrange();
			await act();
			assert(spy);
		});
	}
});
