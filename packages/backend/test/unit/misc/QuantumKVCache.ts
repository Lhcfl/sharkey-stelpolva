/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { FakeInternalEventService } from '../../misc/FakeInternalEventService.js';
import { QuantumKVCache, QuantumKVOpts } from '@/misc/QuantumKVCache.js';

describe(QuantumKVCache, () => {
	let fakeInternalEventService: FakeInternalEventService;
	let madeCaches: { dispose: () => void }[];

	function makeCache<T>(opts?: Partial<QuantumKVOpts<T>> & { name?: string }): QuantumKVCache<T> {
		const _opts = {
			name: 'test',
			lifetime: Infinity,
			fetcher: () => { throw new Error('not implemented'); },
		} satisfies QuantumKVOpts<T> & { name: string };

		if (opts) {
			Object.assign(_opts, opts);
		}

		const cache = new QuantumKVCache<T>(fakeInternalEventService, _opts.name, _opts);
		madeCaches.push(cache);
		return cache;
	}

	beforeEach(() => {
		madeCaches = [];
		fakeInternalEventService = new FakeInternalEventService();
	});

	afterEach(() => {
		madeCaches.forEach(cache => {
			cache.dispose();
		});
	});

	it('should connect on construct', () => {
		makeCache();

		expect(fakeInternalEventService._calls).toContainEqual(['on', ['quantumCacheUpdated', expect.anything(), { ignoreLocal: true }]]);
	});

	it('should disconnect on dispose', () => {
		const cache = makeCache();

		cache.dispose();

		const callback = fakeInternalEventService._calls
			.find(c => c[0] === 'on' && c[1][0] === 'quantumCacheUpdated')
			?.[1][1];
		expect(fakeInternalEventService._calls).toContainEqual(['off', ['quantumCacheUpdated', callback]]);
	});

	it('should store in memory cache', async () => {
		const cache = makeCache<string>();

		await cache.set('foo', 'bar');
		await cache.set('alpha', 'omega');

		const result1 = await cache.get('foo');
		const result2 = await cache.get('alpha');

		expect(result1).toBe('bar');
		expect(result2).toBe('omega');
	});

	it('should emit event when storing', async () => {
		const cache = makeCache<string>({ name: 'fake' });

		await cache.set('foo', 'bar');

		expect(fakeInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['foo'] }]]);
	});

	it('should call onChanged when storing', async () => {
		const fakeOnChanged = jest.fn(() => Promise.resolve());
		const cache = makeCache<string>({
			name: 'fake',
			onChanged: fakeOnChanged,
		});

		await cache.set('foo', 'bar');

		expect(fakeOnChanged).toHaveBeenCalledWith(['foo'], cache);
	});

	it('should not emit event when storing unchanged value', async () => {
		const cache = makeCache<string>({ name: 'fake' });

		await cache.set('foo', 'bar');
		await cache.set('foo', 'bar');

		expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(1);
	});

	it('should not call onChanged when storing unchanged value', async () => {
		const fakeOnChanged = jest.fn(() => Promise.resolve());
		const cache = makeCache<string>({
			name: 'fake',
			onChanged: fakeOnChanged,
		});

		await cache.set('foo', 'bar');
		await cache.set('foo', 'bar');

		expect(fakeOnChanged).toHaveBeenCalledTimes(1);
	});

	it('should fetch an unknown value', async () => {
		const cache = makeCache<string>({
			name: 'fake',
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

	it('should call onChanged when fetching', async () => {
		const fakeOnChanged = jest.fn(() => Promise.resolve());
		const cache = makeCache<string>({
			name: 'fake',
			fetcher: key => `value#${key}`,
			onChanged: fakeOnChanged,
		});

		await cache.fetch('foo');

		expect(fakeOnChanged).toHaveBeenCalledWith(['foo'], cache);
	});

	it('should not emit event when fetching', async () => {
		const cache = makeCache<string>({
			name: 'fake',
			fetcher: key => `value#${key}`,
		});

		await cache.fetch('foo');

		expect(fakeInternalEventService._calls).not.toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['foo'] }]]);
	});

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
			name: 'fake',
			onChanged: fakeOnChanged,
		});

		await cache.set('foo', 'bar');
		await cache.delete('foo');

		expect(fakeOnChanged).toHaveBeenCalledWith(['foo'], cache);
	});

	it('should emit event when deleting', async () => {
		const cache = makeCache<string>({ name: 'fake' });

		await cache.set('foo', 'bar');
		await cache.delete('foo');

		expect(fakeInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['foo'] }]]);
	});

	it('should delete when receiving set event', async () => {
		const cache = makeCache<string>({ name: 'fake' });
		await cache.set('foo', 'bar');

		await fakeInternalEventService._emitRedis('quantumCacheUpdated', { name: 'fake', keys: ['foo'] });

		const result = cache.has('foo');
		expect(result).toBe(false);
	});

	it('should call onChanged when receiving set event', async () => {
		const fakeOnChanged = jest.fn(() => Promise.resolve());
		const cache = makeCache<string>({
			name: 'fake',
			onChanged: fakeOnChanged,
		});

		await fakeInternalEventService._emitRedis('quantumCacheUpdated', { name: 'fake', keys: ['foo'] });

		expect(fakeOnChanged).toHaveBeenCalledWith(['foo'], cache);
	});

	it('should delete when receiving delete event', async () => {
		const cache = makeCache<string>({ name: 'fake' });
		await cache.set('foo', 'bar');

		await fakeInternalEventService._emitRedis('quantumCacheUpdated', { name: 'fake', keys: ['foo'] });

		const result = cache.has('foo');
		expect(result).toBe(false);
	});

	it('should call onChanged when receiving delete event', async () => {
		const fakeOnChanged = jest.fn(() => Promise.resolve());
		const cache = makeCache<string>({
			name: 'fake',
			onChanged: fakeOnChanged,
		});
		await cache.set('foo', 'bar');

		await fakeInternalEventService._emitRedis('quantumCacheUpdated', { name: 'fake', keys: ['foo'] });

		expect(fakeOnChanged).toHaveBeenCalledWith(['foo'], cache);
	});

	describe('get', () => {
		it('should return value if present', async () => {
			const cache = makeCache<string>();
			await cache.set('foo', 'bar');

			const result = cache.get('foo');

			expect(result).toBe('bar');
		});
		it('should return undefined if missing', () => {
			const cache = makeCache<string>();

			const result = cache.get('foo');

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

			expect(fakeInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['foo', 'alpha'] }]]);
			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(1);
		});

		it('should call onChanged once with all items', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				name: 'fake',
				onChanged: fakeOnChanged,
			});

			await cache.setMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(fakeOnChanged).toHaveBeenCalledWith(['foo', 'alpha'], cache);
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
			fakeInternalEventService._reset();

			await cache.setMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(fakeInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['alpha'] }]]);
			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(1);
			expect(fakeOnChanged).toHaveBeenCalledWith(['alpha'], cache);
			expect(fakeOnChanged).toHaveBeenCalledTimes(1);
		});
	});

	describe('getMany', () => {
		it('should return empty for empty input', () => {
			const cache = makeCache();
			const result = cache.getMany([]);
			expect(result).toEqual([]);
		});

		it('should return the value for all keys', () => {
			const cache = makeCache();
			cache.add('foo', 'bar');
			cache.add('alpha', 'omega');

			const result = cache.getMany(['foo', 'alpha']);

			expect(result).toEqual([['foo', 'bar'], ['alpha', 'omega']]);
		});

		it('should return undefined for missing keys', () => {
			const cache = makeCache();
			cache.add('foo', 'bar');

			const result = cache.getMany(['foo', 'alpha']);

			expect(result).toEqual([['foo', 'bar'], ['alpha', undefined]]);
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
			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
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
			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
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

			expect(fakeOnChanged).toHaveBeenCalledWith(['foo', 'alpha'], cache);
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

			expect(fakeOnChanged).toHaveBeenCalledWith(['alpha'], cache);
			expect(fakeOnChanged).toHaveBeenCalledTimes(1);
		});

		it('should not emit event', async () => {
			const cache = makeCache({
				fetcher: k => k,
			});

			await cache.fetchMany(['foo', 'alpha']);

			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
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
			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
		});

		it('should call bulkFetcher for all keys', async () => {
			const mockBulkFetcher = jest.fn((keys: string[]) => keys.map(k => [k, `${k}#value`] as [string, string]));
			const cache = makeCache({
				bulkFetcher: mockBulkFetcher,
			});

			const result = await cache.refreshMany(['foo', 'alpha']);

			expect(result).toEqual([['foo', 'foo#value'], ['alpha', 'alpha#value']]);
			expect(mockBulkFetcher).toHaveBeenCalledWith(['foo', 'alpha'], cache);
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
			expect(mockBulkFetcher).toHaveBeenCalledWith(['foo', 'alpha'], cache);
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

			expect(fakeOnChanged).toHaveBeenCalledWith(['foo', 'alpha'], cache);
			expect(fakeOnChanged).toHaveBeenCalledTimes(1);
		});

		it('should emit event for all keys', async () => {
			const cache = makeCache({
				name: 'fake',
				bulkFetcher: keys => keys.map(k => [k, `${k}#value`]),
			});
			cache.add('foo', 'bar');

			await cache.refreshMany(['foo', 'alpha']);

			expect(fakeInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['foo', 'alpha'] }]]);
			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(1);
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

			expect(fakeInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['foo', 'alpha'] }]]);
			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(1);
		});

		it('should call onChanged once with all items', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				name: 'fake',
				onChanged: fakeOnChanged,
			});

			await cache.deleteMany(['foo', 'alpha']);

			expect(fakeOnChanged).toHaveBeenCalledWith(['foo', 'alpha'], cache);
			expect(fakeOnChanged).toHaveBeenCalledTimes(1);
		});

		it('should do nothing if no keys are provided', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				name: 'fake',
				onChanged: fakeOnChanged,
			});

			await cache.deleteMany([]);

			expect(fakeOnChanged).not.toHaveBeenCalled();
			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
		});
	});

	describe('refresh', () => {
		it('should populate the value', async () => {
			const cache = makeCache<string>({
				name: 'fake',
				fetcher: key => `value#${key}`,
			});

			await cache.refresh('foo');

			const result = cache.has('foo');
			expect(result).toBe(true);
		});

		it('should return the value', async () => {
			const cache = makeCache<string>({
				name: 'fake',
				fetcher: key => `value#${key}`,
			});

			const result = await cache.refresh('foo');

			expect(result).toBe('value#foo');
		});

		it('should replace the value if it exists', async () => {
			const cache = makeCache<string>({
				name: 'fake',
				fetcher: key => `value#${key}`,
			});

			await cache.set('foo', 'bar');
			const result = await cache.refresh('foo');

			expect(result).toBe('value#foo');
		});

		it('should call onChanged', async () => {
			const fakeOnChanged = jest.fn(() => Promise.resolve());
			const cache = makeCache<string>({
				name: 'fake',
				fetcher: key => `value#${key}`,
				onChanged: fakeOnChanged,
			});

			await cache.refresh('foo');

			expect(fakeOnChanged).toHaveBeenCalledWith(['foo'], cache);
		});

		it('should emit event', async () => {
			const cache = makeCache<string>({
				name: 'fake',
				fetcher: key => `value#${key}`,
			});

			await cache.refresh('foo');

			expect(fakeInternalEventService._calls).toContainEqual(['emit', ['quantumCacheUpdated', { name: 'fake', keys: ['foo'] }]]);
		});
	});

	describe('add', () => {
		it('should add the item', () => {
			const cache = makeCache();
			cache.add('foo', 'bar');
			expect(cache.has('foo')).toBe(true);
		});

		it('should not emit event', () => {
			const cache = makeCache({
				name: 'fake',
			});

			cache.add('foo', 'bar');

			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
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
			const cache = makeCache({
				name: 'fake',
			});

			cache.addMany([['foo', 'bar'], ['alpha', 'omega']]);

			expect(fakeInternalEventService._calls.filter(c => c[0] === 'emit')).toHaveLength(0);
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
});
