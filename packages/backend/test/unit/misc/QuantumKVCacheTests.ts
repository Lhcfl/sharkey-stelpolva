/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { GodOfTimeService } from '../../misc/GodOfTimeService.js';
import { MockInternalEventService } from '../../misc/MockInternalEventService.js';
import * as assert from '../../misc/custom-assertions.js';
import { QuantumKVCache, type QuantumKVOpts } from '@/misc/QuantumKVCache.js';
import { KeyNotFoundError } from '@/misc/errors/KeyNotFoundError.js';
import { FetchFailedError } from '@/misc/errors/FetchFailedError.js';
import { DisposedError, DisposingError } from '@/misc/errors/DisposeError.js';

describe(QuantumKVCache, () => {
	let mockTimeService: GodOfTimeService;
	let mockInternalEventService: MockInternalEventService;
	let madeCaches: QuantumKVCache<unknown>[] = [];

	function makeCache<T>(opts?: Partial<QuantumKVOpts<T>> & { name?: string }): QuantumKVCache<T> {
		const _opts = {
			name: expect.getState().currentTestName || 'test',
			lifetime: Infinity,
			fetcher: () => { throw new Error('not implemented'); },
		} satisfies QuantumKVOpts<T> & { name: string };

		if (opts) {
			Object.assign(_opts, opts);
		}

		const services = {
			internalEventService: mockInternalEventService,
			timeService: mockTimeService,
		};

		const cache = new QuantumKVCache<T>(_opts.name, services, _opts);
		madeCaches.push(cache);
		return cache;
	}

	beforeAll(() => {
		mockTimeService = new GodOfTimeService();
		mockInternalEventService = new MockInternalEventService();
	});

	afterEach(async () => {
		for (const cache of madeCaches) {
			await cache.dispose();
		}
		madeCaches = [];
		mockTimeService.reset();
		mockInternalEventService.mockReset();
	});

	describe('dispose', () => {
		it('should disconnect events', async () => {
			const cache = makeCache();

			await cache.dispose();

			expect(mockInternalEventService._calls).toContainEqual(['off', ['quantumCacheUpdated', expect.anything()]]);
			expect(mockInternalEventService._calls).toContainEqual(['off', ['quantumCacheReset', expect.anything()]]);
		});

		it('should clear memory cache', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			await cache.dispose();

			expect(cache.size).toBe(0);
		});

		it('should prevent future calls', async () => {
			const cache = makeCache();

			await cache.dispose();

			await assert.throwsAsync(DisposedError, async () => {
				return await cache.set('foo', 'bar');
			});
		});

		it('should pass dispose signal to fetchers', async () => {
			let abortReason: unknown = undefined;
			const cache = makeCache<string>({
				fetcher: (key, meta) => {
					meta.disposeSignal.addEventListener('abort', () => {
						abortReason = meta.disposeSignal.reason;
					}, { once: true });
					return `${key}#value`;
				},
			});
			await cache.fetch('foo');

			await cache.dispose();

			expect(abortReason).toBeDefined();
			expect(abortReason).toBeInstanceOf(DisposingError);
		});

		it('should abort active fetches', async () => {
			const testReady = Promise.withResolvers<void>();
			const testComplete = Promise.withResolvers<void>();
			const cache = makeCache<string>({
				fetcher: async () => {
					testReady.resolve();
					await testComplete.promise;
					return 'test ending';
				},
			});
			const promise = cache.fetch('foo').finally(() => {});
			await testReady.promise;

			// must be in here:
			await cache.dispose();

			await assert.rejectsAsync(FetchFailedError, promise);
			testComplete.resolve();
		});
	});

	describe('set', () => {
		it('should store in memory cache', async () => {
			const cache = makeCache<string>();

			await cache.set('foo', 'bar');
			await cache.set('alpha', 'omega');

			const result1 = cache.get('foo');
			expect(result1).toBe('bar');
			const result2 = cache.get('alpha');
			expect(result2).toBe('omega');
		});

		it('should emit event when storing', async () => {
			const cache = makeCache<string>({ name: 'fake' });

			await cache.set('foo', 'bar');

			expect(mockInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['foo'] }]]);
		});

		it('should call onChanged when storing', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				onChanged: fakeOnChanged,
			});

			await cache.set('foo', 'bar');

			expect(fakeOnChanged).toHaveBeenCalledWith(['foo'], expect.objectContaining({ cache }));
		});

		it('should not emit event when storing unchanged value', async () => {
			const cache = makeCache<string>();

			await cache.set('foo', 'bar');
			await cache.set('foo', 'bar');

			expect(mockInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(1);
		});

		it('should not call onChanged when storing unchanged value', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				onChanged: fakeOnChanged,
			});

			await cache.set('foo', 'bar');
			await cache.set('foo', 'bar');

			expect(fakeOnChanged).toHaveBeenCalledTimes(1);
		});
	});

	describe('constructor', () => {
		it('should connect quantumCacheUpdated event', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				name: 'fake',
				onChanged: fakeOnChanged,
			});
			await cache.set('foo', 'foo');
			await cache.set('bar', 'bar');

			await mockInternalEventService.mockEmit('quantumCacheUpdated', { name: 'fake', keys: ['foo'] });

			expect(cache.size).toBe(1);
			expect(cache.has('foo')).toBe(false);
			expect(cache.has('bar')).toBe(true);
			expect(fakeOnChanged).toHaveBeenCalledWith(['foo'], expect.objectContaining({ cache }));
			expect(mockInternalEventService._calls).toContainEqual(['on', ['quantumCacheUpdated', expect.anything(), { ignoreLocal: true }]]);
		});

		it('should connect quantumCacheReset event', async () => {
			const fakeOnReset = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				name: 'fake',
				onReset: fakeOnReset,
			});
			await cache.set('foo', 'foo');
			await cache.set('bar', 'bar');

			await mockInternalEventService.mockEmit('quantumCacheReset', { name: 'fake' });

			expect(cache.size).toBe(0);
			expect(fakeOnReset).toHaveBeenCalledWith(expect.objectContaining({ cache }));
			expect(mockInternalEventService._calls).toContainEqual(['on', ['quantumCacheReset', expect.anything(), { ignoreLocal: true }]]);
		});
	});

	describe('get', () => {
		it('should return value if present', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			const result = cache.get('foo');

			expect(result).toBe('bar');
		});

		it('should throw KeyNotFoundError if missing', () => {
			const cache = makeCache<string>();

			assert.throws(KeyNotFoundError, () => {
				cache.get('foo');
			});
		});
	});

	describe('getMaybe', () => {
		it('should return value if present', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			const result = cache.getMaybe('foo');

			expect(result).toBe('bar');
		});

		it('should return undefined if missing', () => {
			const cache = makeCache<string>();

			const result = cache.getMaybe('foo');

			expect(result).toBe(undefined);
		});
	});

	describe('setMany', () => {
		it('should populate all values', async () => {
			const cache = makeCache<string>();

			await cache.setMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(cache.has('foo')).toBe(true);
			expect(cache.has('alpha')).toBe(true);
		});

		it('should emit one event', async () => {
			const cache = makeCache<string>({
				name: 'fake',
			});

			await cache.setMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(mockInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['foo', 'alpha'] }]]);
			expect(mockInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(1);
		});

		it('should call onChanged once with all items', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				onChanged: fakeOnChanged,
			});

			await cache.setMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(fakeOnChanged).toHaveBeenCalledWith(['foo', 'alpha'], expect.objectContaining({ cache }));
			expect(fakeOnChanged).toHaveBeenCalledTimes(1);
		});

		it('should emit events only for changed items', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				name: 'fake',
				onChanged: fakeOnChanged,
			});

			await cache.set('foo', 'bar');
			fakeOnChanged.mockClear();
			mockInternalEventService.mockReset();

			await cache.setMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(mockInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['alpha'] }]]);
			expect(mockInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(1);
			expect(fakeOnChanged).toHaveBeenCalledWith(['alpha'], expect.objectContaining({ cache }));
			expect(fakeOnChanged).toHaveBeenCalledTimes(1);
		});
	});

	describe('getMany', () => {
		it('should return empty for empty input', () => {
			const cache = makeCache();
			const result = cache.getMany([]);
			expect(result).toEqual([]);
		});

		it('should include the value of all found keys', () => {
			const cache = makeCache();
			cache.add('foo', 'bar');
			cache.add('alpha', 'omega');

			const result = cache.getMany(['foo', 'alpha']);

			expect(result).toEqual([['foo', 'bar'], ['alpha', 'omega']]);
		});

		it('should exclude all missing keys', () => {
			const cache = makeCache();
			cache.add('foo', 'bar');

			const result = cache.getMany(['foo', 'alpha']);

			expect(result).toEqual([['foo', 'bar']]);
		});
	});

	describe('fetch', () => {
		it('should fetch an unknown value', async () => {
			const cache = makeCache<string>({
				fetcher: key => `value#${key}`,
			});

			const result = await cache.fetch('foo');

			expect(result).toBe('value#foo');
		});

		it('should store fetched value in memory cache', async () => {
			const cache = makeCache<string>({
				name: 'fake',
				fetcher: key => `value#${key}`,
			});

			await cache.fetch('foo');

			const result = cache.has('foo');
			expect(result).toBe(true);
		});

		it('should call onChanged', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				fetcher: key => `value#${key}`,
				onChanged: fakeOnChanged,
			});

			await cache.fetch('foo');

			expect(fakeOnChanged).toHaveBeenCalledWith(['foo'], expect.objectContaining({ cache }));
		});

		it('should not emit event', async () => {
			const cache = makeCache<string>({
				name: 'fake',
				fetcher: key => `value#${key}`,
			});

			await cache.fetch('foo');

			expect(mockInternalEventService._calls).not.toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['foo'] }]]);
		});

		it('should throw FetchFailedError when fetcher throws error', async () => {
			const cache = makeCache<string>({
				fetcher: () => { throw new Error('test error'); },
			});

			await assert.throwsAsync(FetchFailedError, async () => {
				return await cache.fetch('foo');
			});
		});

		it('should throw KeyNotFoundError when fetcher returns null', async () => {
			const cache = makeCache<string>({
				fetcher: () => null,
			});

			await assert.throwsAsync(KeyNotFoundError, async () => {
				return await cache.fetch('foo');
			});
		});

		it('should throw KeyNotFoundError when fetcher returns undefined', async () => {
			const cache = makeCache<string>({
				fetcher: () => undefined,
			});

			await assert.throwsAsync(KeyNotFoundError, async () => {
				return await cache.fetch('foo');
			});
		});

		it('should respect fetcherConcurrency', async () => {
			await testConcurrency(
				{
					fetcher: key => `value#${key}`,
					fetcherConcurrency: 2,
				},
				(cache, key) => cache.fetch(key),
				['value#foo', 'value#bar', 'value#baz'],
			);
		});

		it('should respect maxConcurrency', async () => {
			await testConcurrency(
				{
					fetcher: key => `value#${key}`,
					maxConcurrency: 2,
				},
				(cache, key) => cache.fetch(key),
				['value#foo', 'value#bar', 'value#baz'],
			);
		});

		it('should de-duplicate calls', async () => {
			// Arrange
			const testComplete = Promise.withResolvers<void>();
			const mockFetcher = jest.fn(async (key: string) => {
				await testComplete.promise;
				return `value#${key}`;
			});
			const cache = makeCache<string>({ fetcher: mockFetcher });

			// Act
			const fetch1 = cache.fetch('foo');
			const fetch2 = cache.fetch('foo');

			// Assert
			testComplete.resolve();
			await expect(fetch1).resolves.toBe('value#foo');
			await expect(fetch2).resolves.toBe('value#foo');
			expect(mockFetcher).toHaveBeenCalledTimes(1);
		});
	});

	describe('fetchMaybe', () => {
		it('should return value when found by fetcher', async () => {
			const cache = makeCache<string>({
				optionalFetcher: () => 'bar',
			});

			const result = await cache.fetchMaybe('foo');

			expect(result).toBe('bar');
		});

		it('should persist value when found by fetcher', async () => {
			const cache = makeCache<string>({
				optionalFetcher: () => 'bar',
			});

			await cache.fetchMaybe('foo');
			const result = cache.get('foo');

			expect(result).toBe('bar');
		});

		it('should call onChanged when found by fetcher', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				optionalFetcher: () => 'bar',
				onChanged: fakeOnChanged,
			});

			await cache.fetchMaybe('foo');

			expect(fakeOnChanged).toHaveBeenCalled();
		});

		it('should return undefined when fetcher returns undefined', async () => {
			const cache = makeCache<string>({
				optionalFetcher: () => undefined,
			});

			const result = await cache.fetchMaybe('foo');

			expect(result).toBe(undefined);
		});

		it('should not call onChanged when fetcher returns undefined', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				optionalFetcher: () => undefined,
				onChanged: fakeOnChanged,
			});

			await cache.fetchMaybe('foo');

			expect(fakeOnChanged).not.toHaveBeenCalled();
		});

		it('should return undefined when fetcher returns null', async () => {
			const cache = makeCache<string>({
				optionalFetcher: () => null,
			});

			const result = await cache.fetchMaybe('foo');

			expect(result).toBe(undefined);
		});

		it('should not call onChanged when fetcher returns null', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				optionalFetcher: () => null,
				onChanged: fakeOnChanged,
			});

			await cache.fetchMaybe('foo');

			expect(fakeOnChanged).not.toHaveBeenCalled();
		});

		it('should throw FetchFailedError when fetcher throws error', async () => {
			const cache = makeCache<string>({
				optionalFetcher: () => { throw new Error('test error'); },
			});

			await assert.throwsAsync(FetchFailedError, async () => {
				return await cache.fetchMaybe('foo');
			});
		});

		it('should fall back on fetcher when optionalFetcher is not defined', async () => {
			const cache = makeCache<string>({
				fetcher: () => 'bar',
			});

			const result = await cache.fetchMaybe('foo');

			expect(result).toBe('bar');
		});

		it('should respect optionalFetcherConcurrency', async () => {
			await testConcurrency(
				{
					optionalFetcher: key => `value#${key}`,
					optionalFetcherConcurrency: 2,
				},
				(cache, key) => cache.fetchMaybe(key),
				['value#foo', 'value#bar', 'value#baz'],
			);
		});

		it('should respect maxConcurrency', async () => {
			await testConcurrency(
				{
					optionalFetcher: key => `value#${key}`,
					maxConcurrency: 2,
				},
				(cache, key) => cache.fetchMaybe(key),
				['value#foo', 'value#bar', 'value#baz'],
			);
		});

		it('should de-duplicate calls', async () => {
			// Arrange
			const testComplete = Promise.withResolvers<void>();
			const mockFetcher = jest.fn(async (key: string) => {
				await testComplete.promise;
				return `value#${key}`;
			});
			const cache = makeCache<string>({ optionalFetcher: mockFetcher });

			// Act
			const fetch1 = cache.fetchMaybe('foo');
			const fetch2 = cache.fetchMaybe('foo');

			// Assert
			testComplete.resolve();
			await expect(fetch1).resolves.toBe('value#foo');
			await expect(fetch2).resolves.toBe('value#foo');
			expect(mockFetcher).toHaveBeenCalledTimes(1);
		});
	});

	describe('fetchMany', () => {
		it('should do nothing for empty input', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache({
				onChanged: fakeOnChanged,
			});

			await cache.fetchMany([]);

			expect(fakeOnChanged).not.toHaveBeenCalled();
			expect(mockInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
		});

		it('should return existing items', async () => {
			const cache = makeCache();
			cache.add('foo', 'bar');
			cache.add('alpha', 'omega');

			const result = await cache.fetchMany(['foo', 'alpha']);

			expect(result).toEqual([['foo', 'bar'], ['alpha', 'omega']]);
		});

		it('should return existing items without events', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache({
				onChanged: fakeOnChanged,
			});
			cache.add('foo', 'bar');
			cache.add('alpha', 'omega');

			await cache.fetchMany(['foo', 'alpha']);

			expect(fakeOnChanged).not.toHaveBeenCalled();
			expect(mockInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
		});

		it('should call bulkFetcher for missing items', async () => {
			const cache = makeCache({
				bulkFetcher: keys => keys.map(k => [k, `${k}#many`]),
				fetcher: key => `${key}#single`,
			});

			const results = await cache.fetchMany(['foo', 'alpha']);

			expect(results).toEqual([['foo', 'foo#many'], ['alpha', 'alpha#many']]);
		});

		it('should call bulkFetcher only once', async () => {
			const mockBulkFetcher = jest.fn((keys: string[]) => keys.map(k => [k, `${k}#value`] as [string, string]));
			const cache = makeCache({
				bulkFetcher: mockBulkFetcher,
			});

			await cache.fetchMany(['foo', 'bar']);

			expect(mockBulkFetcher).toHaveBeenCalledTimes(1);
		});

		it('should call optionalFetcher for single item', async () => {
			const cache = makeCache({
				optionalFetcher: () => 'good',
				bulkFetcher: keys => keys.map(k => [k, 'bad']),
				fetcher: () => 'bad',
			});

			const results = await cache.fetchMany(['foo']);

			expect(results).toEqual([['foo', 'good']]);
		});

		it('should call fetcher for single item when optionalFetcher is not defined', async () => {
			const cache = makeCache({
				bulkFetcher: keys => keys.map(k => [k, 'bad']),
				fetcher: () => 'good',
			});

			const results = await cache.fetchMany(['foo']);

			expect(results).toEqual([['foo', 'good']]);
		});

		it('should call fetcher when fetchMany is undefined', async () => {
			const cache = makeCache({
				fetcher: key => `${key}#single`,
			});

			const results = await cache.fetchMany(['foo', 'alpha']);

			expect(results).toEqual([['foo', 'foo#single'], ['alpha', 'alpha#single']]);
		});

		it('should call onChanged', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache({
				onChanged: fakeOnChanged,
				fetcher: k => k,
			});

			await cache.fetchMany(['foo', 'alpha']);

			expect(fakeOnChanged).toHaveBeenCalledWith(['foo', 'alpha'], expect.objectContaining({ cache }));
			expect(fakeOnChanged).toHaveBeenCalledTimes(1);
		});

		it('should call onChanged only for changed', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache({
				onChanged: fakeOnChanged,
				fetcher: k => k,
			});
			cache.add('foo', 'bar');

			await cache.fetchMany(['foo', 'alpha']);

			expect(fakeOnChanged).toHaveBeenCalledWith(['alpha'], expect.objectContaining({ cache }));
			expect(fakeOnChanged).toHaveBeenCalledTimes(1);
		});

		it('should not emit event', async () => {
			const cache = makeCache({
				fetcher: k => k,
			});

			await cache.fetchMany(['foo', 'alpha']);

			expect(mockInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
		});

		it('should respect bulkFetcherConcurrency', async () => {
			await testConcurrency(
				{
					bulkFetcher: keys => [[keys[0], `value#${keys[0]}`]],
					bulkFetcherConcurrency: 2,
				},
				(cache, key) => cache.fetchMany([key, `${key}#dupe`]),
				[[['foo', 'value#foo']], [['bar', 'value#bar']], [['baz', 'value#baz']]],
			);
		});

		it('should respect maxConcurrency', async () => {
			await testConcurrency(
				{
					bulkFetcher: keys => [[keys[0], `value#${keys[0]}`]],
					maxConcurrency: 2,
				},
				(cache, key) => cache.fetchMany([key, `${key}#dupe`]),
				[[['foo', 'value#foo']], [['bar', 'value#bar']], [['baz', 'value#baz']]],
			);
		});

		it('should de-duplicate calls using fetcher', async () => {
			// Arrange
			const testComplete = Promise.withResolvers<void>();
			const mockFetcher = jest.fn(async (key: string) => {
				await testComplete.promise;
				return `value#${key}`;
			});
			const mockBulkFetcher = jest.fn(async (keys: string[]) => {
				await testComplete.promise;
				return keys.map(key => [key, `value#${key}`] as [string, string]);
			});
			const cache = makeCache<string>({
				fetcher: mockFetcher,
				bulkFetcher: mockBulkFetcher,
			});

			// Act
			const fetch1 = cache.fetch('foo');
			const fetch2 = cache.fetchMany(['foo', 'bar', 'baz']);

			// Assert
			testComplete.resolve();
			await expect(fetch1).resolves.toEqual('value#foo');
			await expect(fetch2).resolves.toEqual([['foo', 'value#foo'], ['bar', 'value#bar'], ['baz', 'value#baz']]);
			expect(mockFetcher).toHaveBeenCalledTimes(1);
			expect(mockFetcher).toHaveBeenCalledWith('foo', expect.objectContaining({ cache }));
			expect(mockBulkFetcher).toHaveBeenCalledTimes(1);
			expect(mockBulkFetcher).toHaveBeenCalledWith(['bar', 'baz'], expect.objectContaining({ cache }));
		});

		it('should de-duplicate calls using optionalFetcher', async () => {
			// Arrange
			const testComplete = Promise.withResolvers<void>();
			const mockFetcher = jest.fn(async (key: string) => {
				await testComplete.promise;
				return `value#${key}`;
			});
			const mockBulkFetcher = jest.fn(async (keys: string[]) => {
				await testComplete.promise;
				return keys.map(key => [key, `value#${key}`] as [string, string]);
			});
			const cache = makeCache<string>({
				optionalFetcher: mockFetcher,
				bulkFetcher: mockBulkFetcher,
			});

			// Act
			const fetch1 = cache.fetchMaybe('foo');
			const fetch2 = cache.fetchMany(['foo', 'bar', 'baz']);

			// Assert
			testComplete.resolve();
			await expect(fetch1).resolves.toEqual('value#foo');
			await expect(fetch2).resolves.toEqual([['foo', 'value#foo'], ['bar', 'value#bar'], ['baz', 'value#baz']]);
			expect(mockFetcher).toHaveBeenCalledTimes(1);
			expect(mockFetcher).toHaveBeenCalledWith('foo', expect.objectContaining({ cache }));
			expect(mockBulkFetcher).toHaveBeenCalledTimes(1);
			expect(mockBulkFetcher).toHaveBeenCalledWith(['bar', 'baz'], expect.objectContaining({ cache }));
		});

		it('should de-duplicate calls using fetcher and optionalFetcher', async () => {
			// Arrange
			const testComplete = Promise.withResolvers<void>();
			const mockFetcher = jest.fn(async (key: string) => {
				await testComplete.promise;
				return `value#${key}`;
			});
			const mockOptionalFetcher = jest.fn(async (key: string) => {
				await testComplete.promise;
				return `value#${key}`;
			});
			const mockBulkFetcher = jest.fn(async (keys: string[]) => {
				await testComplete.promise;
				return keys.map(key => [key, `value#${key}`] as [string, string]);
			});
			const cache = makeCache<string>({
				fetcher: mockFetcher,
				optionalFetcher: mockOptionalFetcher,
				bulkFetcher: mockBulkFetcher,
			});

			// Act
			const fetch1 = cache.fetch('foo');
			const fetch2 = cache.fetchMaybe('bar');
			const fetch3 = cache.fetchMany(['foo', 'bar', 'baz', 'wow']);

			// Assert
			testComplete.resolve();
			await expect(fetch1).resolves.toEqual('value#foo');
			await expect(fetch2).resolves.toEqual('value#bar');
			await expect(fetch3).resolves.toEqual([['foo', 'value#foo'], ['bar', 'value#bar'], ['baz', 'value#baz'], ['wow', 'value#wow']]);
			expect(mockFetcher).toHaveBeenCalledTimes(1);
			expect(mockFetcher).toHaveBeenCalledWith('foo', expect.objectContaining({ cache }));
			expect(mockOptionalFetcher).toHaveBeenCalledTimes(1);
			expect(mockOptionalFetcher).toHaveBeenCalledWith('bar', expect.objectContaining({ cache }));
			expect(mockBulkFetcher).toHaveBeenCalledTimes(1);
			expect(mockBulkFetcher).toHaveBeenCalledWith(['baz', 'wow'], expect.objectContaining({ cache }));
		});
	});

	describe('refresh', () => {
		it('should populate the value', async () => {
			const cache = makeCache<string>({
				fetcher: key => `value#${key}`,
			});

			await cache.refresh('foo');

			const result = cache.has('foo');
			expect(result).toBe(true);
		});

		it('should return the value', async () => {
			const cache = makeCache<string>({
				fetcher: key => `value#${key}`,
			});

			const result = await cache.refresh('foo');

			expect(result).toBe('value#foo');
		});

		it('should replace the value if it exists', async () => {
			const cache = makeCache<string>({
				fetcher: key => `value#${key}`,
			});

			await cache.set('foo', 'bar');
			const result = await cache.refresh('foo');

			expect(result).toBe('value#foo');
		});

		it('should call onChanged', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				fetcher: key => `value#${key}`,
				onChanged: fakeOnChanged,
			});

			await cache.refresh('foo');

			expect(fakeOnChanged).toHaveBeenCalledWith(['foo'], expect.objectContaining({ cache }));
		});

		it('should emit event', async () => {
			const cache = makeCache<string>({
				name: 'fake',
				fetcher: key => `value#${key}`,
			});

			await cache.refresh('foo');

			expect(mockInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['foo'] }]]);
		});

		it('should respect fetcherConcurrency', async () => {
			await testConcurrency(
				{
					fetcher: key => `value#${key}`,
					fetcherConcurrency: 2,
				},
				(cache, key) => cache.refresh(key),
				['value#foo', 'value#bar', 'value#baz'],
			);
		});

		it('should respect maxConcurrency', async () => {
			await testConcurrency(
				{
					fetcher: key => `value#${key}`,
					maxConcurrency: 2,
				},
				(cache, key) => cache.refresh(key),
				['value#foo', 'value#bar', 'value#baz'],
			);
		});

		it('should de-duplicate calls', async () => {
			// Arrange
			const testComplete = Promise.withResolvers<void>();
			const mockFetcher = jest.fn(async (key: string) => {
				await testComplete.promise;
				return `value#${key}`;
			});
			const cache = makeCache<string>({ fetcher: mockFetcher });

			// Act
			const fetch1 = cache.refresh('foo');
			const fetch2 = cache.refresh('foo');

			// Assert
			testComplete.resolve();
			await expect(fetch1).resolves.toBe('value#foo');
			await expect(fetch2).resolves.toBe('value#foo');
			expect(mockFetcher).toHaveBeenCalledTimes(1);
		});
	});

	describe('refreshMaybe', () => {
		it('should return value when found by fetcher', async () => {
			const cache = makeCache<string>({
				optionalFetcher: () => 'bar',
			});

			const result = await cache.refreshMaybe('foo');

			expect(result).toBe('bar');
		});

		it('should persist value when found by fetcher', async () => {
			const cache = makeCache<string>({
				optionalFetcher: () => 'bar',
			});

			await cache.refreshMaybe('foo');
			const result = cache.get('foo');

			expect(result).toBe('bar');
		});

		it('should call onChanged when found by fetcher', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				optionalFetcher: () => 'bar',
				onChanged: fakeOnChanged,
			});

			await cache.refreshMaybe('foo');

			expect(fakeOnChanged).toHaveBeenCalledWith(['foo'], expect.objectContaining({ cache }));
		});

		it('should return undefined when fetcher returns undefined', async () => {
			const cache = makeCache<string>({
				optionalFetcher: () => undefined,
			});

			const result = await cache.refreshMaybe('foo');

			expect(result).toBe(undefined);
		});

		it('should call onChanged when fetcher returns undefined', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				optionalFetcher: () => undefined,
				onChanged: fakeOnChanged,
			});

			await cache.refreshMaybe('foo');

			expect(fakeOnChanged).toHaveBeenCalledWith(['foo'], expect.objectContaining({ cache }));
		});

		it('should return undefined when fetcher returns null', async () => {
			const cache = makeCache<string>({
				optionalFetcher: () => null,
			});

			const result = await cache.refreshMaybe('foo');

			expect(result).toBe(undefined);
		});

		it('should call onChanged when fetcher returns null', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				optionalFetcher: () => null,
				onChanged: fakeOnChanged,
			});

			await cache.refreshMaybe('foo');

			expect(fakeOnChanged).toHaveBeenCalledWith(['foo'], expect.objectContaining({ cache }));
		});

		it('should throw FetchFailedError when fetcher throws error', async () => {
			const cache = makeCache<string>({
				optionalFetcher: () => { throw new Error('test error'); },
			});

			await assert.throwsAsync(FetchFailedError, async () => {
				return await cache.refreshMaybe('foo');
			});
		});

		it('should fall back on fetcher when optionalFetcher is not defined', async () => {
			const cache = makeCache<string>({
				fetcher: () => 'bar',
			});

			const result = await cache.refreshMaybe('foo');

			expect(result).toBe('bar');
		});

		it('should replace the value if it exists', async () => {
			const cache = makeCache<string>({
				optionalFetcher: key => `value#${key}`,
			});

			await cache.set('foo', 'bar');
			const result = await cache.refreshMaybe('foo');

			expect(result).toBe('value#foo');
		});

		it('should emit event when found', async () => {
			const cache = makeCache<string>({
				name: 'fake',
				optionalFetcher: key => `value#${key}`,
			});

			await cache.refreshMaybe('foo');

			expect(mockInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['foo'] }]]);
		});

		it('should emit event when not found', async () => {
			const cache = makeCache<string>({
				name: 'fake',
				optionalFetcher: () => undefined,
			});

			await cache.refreshMaybe('foo');

			expect(mockInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['foo'] }]]);
		});

		it('should respect optionalFetcherConcurrency', async () => {
			await testConcurrency(
				{
					optionalFetcher: key => `value#${key}`,
					optionalFetcherConcurrency: 2,
				},
				(cache, key) => cache.refreshMaybe(key),
				['value#foo', 'value#bar', 'value#baz'],
			);
		});

		it('should respect maxConcurrency', async () => {
			await testConcurrency(
				{
					fetcher: key => `value#${key}`,
					maxConcurrency: 2,
				},
				(cache, key) => cache.refreshMaybe(key),
				['value#foo', 'value#bar', 'value#baz'],
			);
		});

		it('should de-duplicate calls', async () => {
			// Arrange
			const testComplete = Promise.withResolvers<void>();
			const mockFetcher = jest.fn(async (key: string) => {
				await testComplete.promise;
				return `value#${key}`;
			});
			const cache = makeCache<string>({ optionalFetcher: mockFetcher });

			// Act
			const fetch1 = cache.refreshMaybe('foo');
			const fetch2 = cache.refreshMaybe('foo');

			// Assert
			testComplete.resolve();
			await expect(fetch1).resolves.toBe('value#foo');
			await expect(fetch2).resolves.toBe('value#foo');
			expect(mockFetcher).toHaveBeenCalledTimes(1);
		});
	});

	describe('refreshMany', () => {
		it('should do nothing for empty input', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache({
				onChanged: fakeOnChanged,
			});

			const result = await cache.refreshMany([]);

			expect(result).toEqual([]);
			expect(fakeOnChanged).not.toHaveBeenCalled();
			expect(mockInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
		});

		it('should call bulkFetcher for all keys', async () => {
			const mockBulkFetcher = jest.fn((keys: string[]) => keys.map(k => [k, `${k}#value`] as [string, string]));
			const cache = makeCache({
				bulkFetcher: mockBulkFetcher,
			});

			const result = await cache.refreshMany(['foo', 'alpha']);

			expect(result).toEqual([['foo', 'foo#value'], ['alpha', 'alpha#value']]);
			expect(mockBulkFetcher).toHaveBeenCalledWith(['foo', 'alpha'], expect.objectContaining({ cache }));
			expect(mockBulkFetcher).toHaveBeenCalledTimes(1);
		});

		it('should replace any existing keys', async () => {
			const mockBulkFetcher = jest.fn((keys: string[]) => keys.map(k => [k, `${k}#value`] as [string, string]));
			const cache = makeCache({
				bulkFetcher: mockBulkFetcher,
			});
			cache.add('foo', 'bar');

			const result = await cache.refreshMany(['foo', 'alpha']);

			expect(result).toEqual([['foo', 'foo#value'], ['alpha', 'alpha#value']]);
			expect(mockBulkFetcher).toHaveBeenCalledWith(['foo', 'alpha'], expect.objectContaining({ cache }));
			expect(mockBulkFetcher).toHaveBeenCalledTimes(1);
		});

		it('should call onChanged for all keys', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache({
				bulkFetcher: keys => keys.map(k => [k, `${k}#value`]),
				onChanged: fakeOnChanged,
			});
			cache.add('foo', 'bar');

			await cache.refreshMany(['foo', 'alpha']);

			expect(fakeOnChanged).toHaveBeenCalledWith(['foo', 'alpha'], expect.objectContaining({ cache }));
			expect(fakeOnChanged).toHaveBeenCalledTimes(1);
		});

		it('should emit event for all keys', async () => {
			const cache = makeCache({
				name: 'fake',
				bulkFetcher: keys => keys.map(k => [k, `${k}#value`]),
			});
			cache.add('foo', 'bar');

			await cache.refreshMany(['foo', 'alpha']);

			expect(mockInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['foo', 'alpha'] }]]);
			expect(mockInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(1);
		});

		it('should call optionalFetcher for single item', async () => {
			const cache = makeCache({
				optionalFetcher: () => 'good',
				bulkFetcher: keys => keys.map(k => [k, 'bad']),
				fetcher: () => 'bad',
			});

			const results = await cache.refreshMany(['foo']);

			expect(results).toEqual([['foo', 'good']]);
		});

		it('should call fetcher for single item when optionalFetcher is not defined', async () => {
			const cache = makeCache({
				bulkFetcher: keys => keys.map(k => [k, 'bad']),
				fetcher: () => 'good',
			});

			const results = await cache.refreshMany(['foo']);

			expect(results).toEqual([['foo', 'good']]);
		});

		it('should throw FetchFailedError when bulk fetcher throws error', async () => {
			const cache = makeCache<string>({
				bulkFetcher: () => { throw new Error('test error'); },
			});

			await assert.throwsAsync(FetchFailedError, async () => {
				return await cache.refreshMany(['foo']);
			});
		});

		it('should throw FetchFailedError when fallback fetcher throws error', async () => {
			const cache = makeCache<string>({
				fetcher: () => { throw new Error('test error'); },
			});

			await assert.throwsAsync(FetchFailedError, async () => {
				return await cache.refreshMany(['foo']);
			});
		});

		it('should not throw when fallback fetcher returns null', async () => {
			const cache = makeCache<string>({
				fetcher: () => null,
			});

			const result = await cache.refreshMany(['foo']);

			expect(result).toHaveLength(0);
		});

		it('should not throw when fallback fetcher returns undefined', async () => {
			const cache = makeCache<string>({
				fetcher: () => undefined,
			});

			const result = await cache.refreshMany(['foo']);

			expect(result).toHaveLength(0);
		});

		it('should not throw when bulk fetcher returns empty', async () => {
			const cache = makeCache<string>({
				bulkFetcher: () => [],
			});

			const result = await cache.refreshMany(['foo', 'bar']);

			expect(result).toHaveLength(0);
		});

		it('should respect bulkFetcherConcurrency', async () => {
			await testConcurrency(
				{
					bulkFetcher: keys => [[keys[0], `value#${keys[0]}`]],
					bulkFetcherConcurrency: 2,
				},
				(cache, key) => cache.refreshMany([key, `${key}#dupe`]),
				[[['foo', 'value#foo']], [['bar', 'value#bar']], [['baz', 'value#baz']]],
			);
		});

		it('should respect maxConcurrency', async () => {
			await testConcurrency(
				{
					bulkFetcher: keys => [[keys[0], `value#${keys[0]}`]],
					maxConcurrency: 2,
				},
				(cache, key) => cache.refreshMany([key, `${key}#dupe`]),
				[[['foo', 'value#foo']], [['bar', 'value#bar']], [['baz', 'value#baz']]],
			);
		});

		it('should de-duplicate calls using fetcher', async () => {
			// Arrange
			const testComplete = Promise.withResolvers<void>();
			const mockFetcher = jest.fn(async (key: string) => {
				await testComplete.promise;
				return `value#${key}`;
			});
			const mockBulkFetcher = jest.fn(async (keys: string[]) => {
				await testComplete.promise;
				return keys.map(key => [key, `value#${key}`] as [string, string]);
			});
			const cache = makeCache<string>({
				fetcher: mockFetcher,
				bulkFetcher: mockBulkFetcher,
			});

			// Act
			const fetch1 = cache.fetch('foo');
			const fetch2 = cache.refreshMany(['foo', 'bar', 'baz']);

			// Assert
			testComplete.resolve();
			await expect(fetch1).resolves.toEqual('value#foo');
			await expect(fetch2).resolves.toEqual([['foo', 'value#foo'], ['bar', 'value#bar'], ['baz', 'value#baz']]);
			expect(mockFetcher).toHaveBeenCalledTimes(1);
			expect(mockFetcher).toHaveBeenCalledWith('foo', expect.objectContaining({ cache }));
			expect(mockBulkFetcher).toHaveBeenCalledTimes(1);
			expect(mockBulkFetcher).toHaveBeenCalledWith(['bar', 'baz'], expect.objectContaining({ cache }));
		});

		it('should de-duplicate calls using optionalFetcher', async () => {
			// Arrange
			const testComplete = Promise.withResolvers<void>();
			const mockOptionalFetcher = jest.fn(async (key: string) => {
				await testComplete.promise;
				return `value#${key}`;
			});
			const mockBulkFetcher = jest.fn(async (keys: string[]) => {
				await testComplete.promise;
				return keys.map(key => [key, `value#${key}`] as [string, string]);
			});
			const cache = makeCache<string>({
				optionalFetcher: mockOptionalFetcher,
				bulkFetcher: mockBulkFetcher,
			});

			// Act
			const fetch1 = cache.fetchMaybe('foo');
			const fetch2 = cache.refreshMany(['foo', 'bar', 'baz']);

			// Assert
			testComplete.resolve();
			await expect(fetch1).resolves.toEqual('value#foo');
			await expect(fetch2).resolves.toEqual([['foo', 'value#foo'], ['bar', 'value#bar'], ['baz', 'value#baz']]);
			expect(mockOptionalFetcher).toHaveBeenCalledTimes(1);
			expect(mockOptionalFetcher).toHaveBeenCalledWith('foo', expect.objectContaining({ cache }));
			expect(mockBulkFetcher).toHaveBeenCalledTimes(1);
			expect(mockBulkFetcher).toHaveBeenCalledWith(['bar', 'baz'], expect.objectContaining({ cache }));
		});

		it('should de-duplicate calls using fetcher and optionalFetcher', async () => {
			// Arrange
			const testComplete = Promise.withResolvers<void>();
			const mockFetcher = jest.fn(async (key: string) => {
				await testComplete.promise;
				return `value#${key}`;
			});
			const mockOptionalFetcher = jest.fn(async (key: string) => {
				await testComplete.promise;
				return `value#${key}`;
			});
			const mockBulkFetcher = jest.fn(async (keys: string[]) => {
				await testComplete.promise;
				return keys.map(key => [key, `value#${key}`] as [string, string]);
			});
			const cache = makeCache<string>({
				fetcher: mockFetcher,
				optionalFetcher: mockOptionalFetcher,
				bulkFetcher: mockBulkFetcher,
			});

			// Act
			const fetch1 = cache.fetch('foo');
			const fetch2 = cache.fetchMaybe('bar');
			const fetch3 = cache.refreshMany(['foo', 'bar', 'baz', 'wow']);

			// Assert
			testComplete.resolve();
			await expect(fetch1).resolves.toEqual('value#foo');
			await expect(fetch2).resolves.toEqual('value#bar');
			await expect(fetch3).resolves.toEqual([['foo', 'value#foo'], ['bar', 'value#bar'], ['baz', 'value#baz'], ['wow', 'value#wow']]);
			expect(mockFetcher).toHaveBeenCalledTimes(1);
			expect(mockFetcher).toHaveBeenCalledWith('foo', expect.objectContaining({ cache }));
			expect(mockOptionalFetcher).toHaveBeenCalledTimes(1);
			expect(mockOptionalFetcher).toHaveBeenCalledWith('bar', expect.objectContaining({ cache }));
			expect(mockBulkFetcher).toHaveBeenCalledTimes(1);
			expect(mockBulkFetcher).toHaveBeenCalledWith(['baz', 'wow'], expect.objectContaining({ cache }));
		});
	});

	describe('delete', () => {
		it('should delete from memory cache', async () => {
			const cache = makeCache<string>();

			await cache.set('foo', 'bar');
			await cache.delete('foo');

			const result = cache.has('foo');
			expect(result).toBe(false);
		});

		it('should call onChanged when deleting', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				onChanged: fakeOnChanged,
			});

			await cache.set('foo', 'bar');
			await cache.delete('foo');

			expect(fakeOnChanged).toHaveBeenCalledWith(['foo'], expect.objectContaining({ cache }));
		});

		it('should emit event when deleting', async () => {
			const cache = makeCache<string>({ name: 'fake' });

			await cache.set('foo', 'bar');
			await cache.delete('foo');

			expect(mockInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['foo'] }]]);
		});
	});

	describe('deleteMany', () => {
		it('should remove keys from memory cache', async () => {
			const cache = makeCache<string>();

			await cache.set('foo', 'bar');
			await cache.set('alpha', 'omega');
			await cache.deleteMany(['foo', 'alpha']);

			expect(cache.has('foo')).toBe(false);
			expect(cache.has('alpha')).toBe(false);
		});

		it('should emit only one event', async () => {
			const cache = makeCache<string>({
				name: 'fake',
			});

			await cache.deleteMany(['foo', 'alpha']);

			expect(mockInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['foo', 'alpha'] }]]);
			expect(mockInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(1);
		});

		it('should call onChanged once with all items', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				onChanged: fakeOnChanged,
			});

			await cache.deleteMany(['foo', 'alpha']);

			expect(fakeOnChanged).toHaveBeenCalledWith(['foo', 'alpha'], expect.objectContaining({ cache }));
			expect(fakeOnChanged).toHaveBeenCalledTimes(1);
		});

		it('should do nothing if no keys are provided', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				onChanged: fakeOnChanged,
			});

			await cache.deleteMany([]);

			expect(fakeOnChanged).not.toHaveBeenCalled();
			expect(mockInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
		});
	});

	describe('reset', () => {
		it('should erase all items', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');
			await cache.set('alpha', 'omega');

			await cache.reset();

			expect(cache.size).toBe(0);
		});

		it('should call onReset', async () => {
			const fakeOnReset = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				onReset: fakeOnReset,
			});
			await cache.set('foo', 'bar');
			await cache.set('alpha', 'omega');

			await cache.reset();

			expect(fakeOnReset).toHaveBeenCalled();
		});

		it('should emit event', async () => {
			const cache = makeCache<string>({
				name: 'fake',
			});
			await cache.set('foo', 'bar');
			await cache.set('alpha', 'omega');

			await cache.reset();

			expect(mockInternalEventService._calls).toContainEqual(['emit', ['quantumCacheReset', { name: 'fake' }]]);
		});
	});

	describe('add', () => {
		it('should add the item', () => {
			const cache = makeCache();
			cache.add('foo', 'bar');
			expect(cache.has('foo')).toBe(true);
		});

		it('should not emit event', () => {
			const cache = makeCache();

			cache.add('foo', 'bar');

			expect(mockInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
		});

		it('should not call onChanged', () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache({
				onChanged: fakeOnChanged,
			});

			cache.add('foo', 'bar');

			expect(fakeOnChanged).not.toHaveBeenCalled();
		});
	});

	describe('addMany', () => {
		it('should add all items', () => {
			const cache = makeCache();

			cache.addMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(cache.has('foo')).toBe(true);
			expect(cache.has('alpha')).toBe(true);
		});

		it('should not emit event', () => {
			const cache = makeCache();

			cache.addMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(mockInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
		});

		it('should not call onChanged', () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache({
				onChanged: fakeOnChanged,
			});

			cache.addMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(fakeOnChanged).not.toHaveBeenCalled();
		});
	});

	describe('has', () => {
		it('should return false when empty', () => {
			const cache = makeCache();
			const result = cache.has('foo');
			expect(result).toBe(false);
		});

		it('should return false when value is not in memory', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			const result = cache.has('alpha');

			expect(result).toBe(false);
		});

		it('should return true when value is in memory', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			const result = cache.has('foo');

			expect(result).toBe(true);
		});
	});

	describe('size', () => {
		it('should return 0 when empty', () => {
			const cache = makeCache();
			expect(cache.size).toBe(0);
		});

		it('should return correct size when populated', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			expect(cache.size).toBe(1);
		});
	});

	describe('entries', () => {
		it('should return empty when empty', () => {
			const cache = makeCache();

			const result = Array.from(cache.entries());

			expect(result).toHaveLength(0);
		});

		it('should return all entries when populated', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			const result = Array.from(cache.entries());

			expect(result).toEqual([['foo', 'bar']]);
		});
	});

	describe('keys', () => {
		it('should return empty when empty', () => {
			const cache = makeCache();

			const result = Array.from(cache.keys());

			expect(result).toHaveLength(0);
		});

		it('should return all keys when populated', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			const result = Array.from(cache.keys());

			expect(result).toEqual(['foo']);
		});
	});

	describe('values', () => {
		it('should return empty when empty', () => {
			const cache = makeCache();

			const result = Array.from(cache.values());

			expect(result).toHaveLength(0);
		});

		it('should return all values when populated', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			const result = Array.from(cache.values());

			expect(result).toEqual(['bar']);
		});
	});

	describe('[Symbol.iterator]', () => {
		it('should return empty when empty', () => {
			const cache = makeCache();

			const result = Array.from(cache);

			expect(result).toHaveLength(0);
		});

		it('should return all entries when populated', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			const result = Array.from(cache);

			expect(result).toEqual([['foo', 'bar']]);
		});
	});

	async function testConcurrency<TFetch>(opts: Partial<QuantumKVOpts<string>>, fetchCallback: (cache: QuantumKVCache<string>, key: string) => Promise<TFetch>, expectedResults: unknown): Promise<void> {
		const fetcher = opts.fetcher;
		const optionalFetcher = opts.optionalFetcher;
		const bulkFetcher = opts.bulkFetcher;

		// Arrange
		const fetches = {} as Record<string, FetchController<TFetch>>;
		const testReady = Promise.withResolvers<void>();
		const cache = makeCache<string>({
			fetcherConcurrency: 4,
			optionalFetcherConcurrency: 4,
			bulkFetcherConcurrency: 4,
			maxConcurrency: 4,

			...opts,

			fetcher: fetcher ? async (key, meta) => {
				await waitForSignalBeforeFetch(testReady, key, fetches);
				return fetcher(key, meta);
			} : undefined,
			optionalFetcher: optionalFetcher ? async (key, meta) => {
				await waitForSignalBeforeFetch(testReady, key, fetches);
				return optionalFetcher(key, meta);
			} : undefined,
			bulkFetcher: bulkFetcher ? async (keys, meta) => {
				await waitForSignalBeforeFetch(testReady, keys[0], fetches);
				return bulkFetcher(keys, meta);
			} : undefined,
		});
		for (const key of ['foo', 'bar', 'baz']) {
			const fetcher = {
				created: false,
				creating: Promise.withResolvers<void>(),
				gate: Promise.withResolvers<void>(),
				promise: fetchCallback(cache, key),
				execute: async () => {
					await fetcher.creating.promise;
					return await fetcher.execute();
				},
				complete: async () => {
					if (!fetcher.created) throw new Error(`test error: cannot complete an unstarted fetcher for ${key}`);

					fetcher.gate.resolve();
					return await fetcher.promise;
				},
			};
			fetches[key] = fetcher;
		}

		// Act
		testReady.resolve();

		// Assert: should create fetchers up to the limit
		await Promise.all([fetches.foo.creating.promise, fetches.bar.creating.promise]);
		expect(fetches.foo.created).toBe(true);
		expect(fetches.bar.created).toBe(true);
		expect(fetches.baz.created).toBe(false);

		// Assert: when one completes, should create the next one
		await fetches.foo.complete();
		await fetches.baz.creating.promise;
		expect(fetches.baz.created).toBe(true);

		// Assert: when all complete, final results should be correct
		const results = await Promise.all([
			fetches.foo.complete(),
			fetches.bar.complete(),
			fetches.baz.complete(),
		]);
		expect(results).toEqual(expectedResults);
	}
});

// used for concurrency tests
async function waitForSignalBeforeFetch<T>(testReady: PromiseWithResolvers<void>, key: string, fetches: Record<string, FetchController<T>>) {
	await testReady.promise;

	const fetch = fetches[key];
	expect(fetch).toBeTruthy();

	fetch.created = true;
	fetch.creating.resolve();

	await fetch.gate.promise;
}

// used for concurrency tests
interface FetchController<T> {
	// create phase
	/** set to true when fetch callback is executed */
	created: boolean,
	/** triggered internally when the callback is executed */
	creating: PromiseWithResolvers<void>,

	// execute phase
	/** triggered externally to start the fetcher */
	gate: PromiseWithResolvers<void>,
	/** resolves when fetcher completes */
	promise: Promise<T>,

	// controls
	/** starts and executes the fetcher */
	complete: () => Promise<T>;
	/** awaits creation, then starts and executes the fetcher */
	execute: () => Promise<T>;
}
