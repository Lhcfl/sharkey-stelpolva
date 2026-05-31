/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EntityNotFoundError } from 'typeorm';
import promiseLimit from 'promise-limit';
import { bindThis } from '@/decorators.js';
import { makeKVPArray, type KVPArray } from '@/misc/kvp-array.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { withCleanup, withSignal } from '@/misc/promiseUtils.js';
import { promiseTry } from '@/misc/promise-try.js';
import { FetchFailedError } from '@/misc/errors/FetchFailedError.js';
import { KeyNotFoundError } from '@/misc/errors/KeyNotFoundError.js';
import { QuantumCacheError } from '@/misc/errors/QuantumCacheError.js';
import { MemoryKVCache, type MemoryCacheServices } from '@/misc/cache.js';
import { DisposedError, DisposingError } from '@/misc/errors/DisposeError.js';
import { SkEventSource, type EventListener, type ListenerProps, type SkEventEmitter } from '@/misc/SkEventEmitter.js';
import type { InternalEventService, InternalEventTypes } from '@/global/InternalEventService.js';
import type { Limiter } from '@/misc/promise-map.js';
import type { EmptyObject } from '@/types.js';

export interface QuantumKVOpts<TIn, T extends Value<TIn> = Value<TIn>> {
	/**
	 * Memory cache lifetime in milliseconds.
	 */
	lifetime: number;

	/**
	 * Callback to fetch required values by key.
	 */
	fetcher: Fetcher<T>;

	/**
	 * Callback to fetch optional values by key.
	 */
	optionalFetcher?: OptionalFetcher<T>;

	/**
	 * Callback to fetch multiple optional values by key.
	 */
	bulkFetcher?: BulkFetcher<T>;

	/**
	 * Optional limit on the number of calls to fetcher to allow at once.
	 * If more than this many fetches are attempted, the excess will be queued until the earlier operations complete.
	 * The total number of calls will never exceed maxConcurrency.
	 * Min: 1
	 * Default: 4
	 */
	fetcherConcurrency?: number;

	/**
	 * Optional limit on the number of calls to optionalFetcher to allow at once.
	 * If more than this many fetches are attempted, the excess will be queued until the earlier operations complete.
	 * The total number of calls will never exceed maxConcurrency.
	 * Min: 1
	 * Default: 4
	 */
	optionalFetcherConcurrency?: number;

	/**
	 * Optional limit on the number of calls to bulkFetcher to allow at once.
	 * If more than this many fetches are attempted, the excess will be queued until the earlier operations complete.
	 * The total number of calls will never exceed maxConcurrency.
	 * Min: 1
	 * Default: 2
	 */
	bulkFetcherConcurrency?: number;

	/**
	 * Optional limit on the total number of calls to fetcher, optionalFetcher, or bulkFetcher to allow at once.
	 * If more than this many fetches are attempted, the excess will be queued until the earlier operations complete.
	 * Min: 1
	 * Default: fetcherConcurrency, optionalFetcherConcurrency, or bulkFetcherConcurrency - whichever is highest.
	 */
	maxConcurrency?: number;
}

export type QuantumKVCacheEvents<T> = {
	/**
	 * Called when one or more values are changed (created, updated, or deleted) in the cache, either locally or elsewhere in the cluster.
	 * This is called *after* the cache state is updated.
	 * May be synchronous or async.
	 */
	changed: CallbackMeta<T> & {
		/**
		 * Key(s) that have changed.
		 */
		keys: string[];
	}

	/**
	 * when all values are removed from the cache, either locally or elsewhere in the cluster.
	 * This is called *after* the cache state is updated.
	 * May be synchronous or async.
	 */
	reset: CallbackMeta<T>;
};

export interface CallbackMeta<T> {
	/**
	 * The cache instance that triggered this callback.
	 */
	readonly cache: QuantumKVCache<T>;

	/**
	 * AbortSignal that will fire when the cache is disposed.
	 * Should be propagated to ensure smooth cleanup and shutdown.
	 */
	readonly disposeSignal: AbortSignal;

	/**
	 * Aborts the callback operation with a given error message and optional cause.
	 * @param message Error message to include.
	 * @param opts Options to attach to the resulting Error instance.
	 */
	fail(message: string, opts?: ErrorOptions): never;
}

/**
 * Callback to fetch the value for a key that wasn't found in the cache, and is required to continue.
 * Should return the fetched value, or null/undefined if no value exists for the given key.
 * Missing keys may also produce an EntityNotFound or KeyNotFoundException exception, which will be wrapped to gracefully abort the operation.
 * May be synchronous or async.
 */
export type Fetcher<T> = (key: string, meta: CallbackMeta<T>) => MaybePromise<Value<T> | null | undefined>;

/**
 * Optional callback to fetch the value for a key that wasn't found in the cache, and isn't required to continue.
 * Should return the fetched value, or null/undefined if no value exists for the given key.
 * Missing keys should *not* produce any exception, as it will be wrapped to gracefully abort the operation.
 * May be synchronous or async.
 * If not provided, then the implementation will fall back on fetcher().
 */
export type OptionalFetcher<T> = (key: string, meta: CallbackMeta<T>) => MaybePromise<Value<T> | null | undefined>;

/**
 * Optional callback to fetch the value for multiple keys that weren't found in the cache.
 * Should return the fetched values for each key, or null/undefined if no value exists for the given key.
 * Missing keys may also be omitted from the response entirely, but no error should be thrown.
 * May be synchronous or async.
 * If not provided, then the implementation will fall back on repeated calls to optionalFetcher() or fetcher().
 */
export type BulkFetcher<T> = (keys: string[], meta: CallbackMeta<T>) => MaybePromise<Iterable<[key: string, value: Value<T> | null | undefined]>>;

type ActiveFetcher<T> = Promise<T>;
type ActiveOptionalFetcher<T> = Promise<T | undefined>;
type ActiveBulkFetcher<T> = Promise<KeyValue<T>[]>;

// Make sure null / undefined cannot be a valid type
// https://stackoverflow.com/a/63045455
type Value<T> = NonNullable<T>;
type KeyValue<T> = [key: string, value: T];
type MaybePromise<T> = T | Promise<T>;
type AtLeastOne<T> = [T, ...T[]];

export interface QuantumCacheServices extends MemoryCacheServices {
	/**
	 * Event bus to attach to.
	 * This can be mocked for easier testing under DI.
	 */
	readonly internalEventService: InternalEventService;
}

/**
 * QuantumKVCache is a lifetime-bounded memory cache (like MemoryKVCache) with automatic cross-cluster synchronization via Redis.
 * All nodes in the cluster are guaranteed to have a *subset* view of the current accurate state, though individual processes may have different items in their local cache.
 * This ensures that a call to get() will never return stale data.
 */
export class QuantumKVCache<TIn, T extends Value<TIn> = Value<TIn>> implements Iterable<readonly [key: string, value: T]>, SkEventEmitter<QuantumKVCacheEvents<T>> {
	private readonly internalEventService: InternalEventService;

	private readonly memoryCache: MemoryKVCache<T>;
	private readonly eventSource = new SkEventSource<QuantumKVCacheEvents<T>>();

	private readonly activeFetchers = new Map<string, ActiveFetcher<T>>();
	private readonly activeOptionalFetchers = new Map<string, ActiveOptionalFetcher<T>>();
	private readonly activeBulkFetchers = new Map<string, ActiveBulkFetcher<T>>();

	private readonly globalLimiter: Limiter;
	private readonly fetcherLimiter: Limiter;
	private readonly optionalFetcherLimiter: Limiter;
	private readonly bulkFetcherLimiter: Limiter;

	public readonly fetcher: Fetcher<T>;
	public readonly optionalFetcher: OptionalFetcher<T> | undefined;
	public readonly bulkFetcher: BulkFetcher<T> | undefined;

	private readonly disposeController = new AbortController();
	private isDisposing = false;
	private isDisposed = false;

	/**
	 * @param name Unique name of the cache - must be the same in all processes.
	 * @param services DI services - internalEventService is required
	 * @param opts Cache options
	 */
	constructor(
		public readonly name: string,
		services: QuantumCacheServices,
		opts: QuantumKVOpts<TIn, T>,
	) {
		// OK: we forward all management calls to the inner cache.
		// eslint-disable-next-line no-restricted-syntax
		this.memoryCache = new MemoryKVCache(name + ':mem', services, { lifetime: opts.lifetime });

		// Set up rate limiters
		const fetcherConcurrency = opts.fetcherConcurrency
			? Math.max(opts.fetcherConcurrency, 1)
			: 12;
		this.fetcherLimiter = promiseLimit(fetcherConcurrency);

		const optionalFetcherConcurrency = opts.optionalFetcherConcurrency
			? Math.max(opts.optionalFetcherConcurrency, 1)
			: 12;
		this.optionalFetcherLimiter = promiseLimit(optionalFetcherConcurrency);

		const bulkFetcherConcurrency = opts.bulkFetcherConcurrency
			? Math.max(opts.bulkFetcherConcurrency, 1)
			: 6;
		this.bulkFetcherLimiter = promiseLimit(bulkFetcherConcurrency);

		const globalConcurrency = opts.maxConcurrency
			? Math.max(opts.maxConcurrency, 1)
			: Math.max(fetcherConcurrency, optionalFetcherConcurrency, bulkFetcherConcurrency);
		this.globalLimiter = promiseLimit(globalConcurrency);

		this.fetcher = opts.fetcher;
		this.optionalFetcher = opts.optionalFetcher;
		this.bulkFetcher = opts.bulkFetcher;

		this.internalEventService = services.internalEventService;
		this.internalEventService.on('quantumCacheUpdated', this.onQuantumCacheUpdated, {
			// Ignore our own events, otherwise we'll immediately erase any set value.
			ignoreLocal: true,
		});
		this.internalEventService.on('quantumCacheReset', this.onQuantumCacheReset, {
			// Ignore our own events, otherwise we'll immediately erase any set value.
			ignoreLocal: true,
		});
	}

	private get callbackMeta(): CallbackMeta<T> {
		return {
			cache: this,
			disposeSignal: this.disposeController.signal,
			fail: (message, opts) => {
				throw new QuantumCacheError(this.nameForError, message, opts);
			},
		};
	}

	@bindThis
	private getCallbackMetaForFetch(keys: string | readonly string[]): CallbackMeta<T> {
		return {
			...this.callbackMeta,
			fail: (message, opts) => {
				throw new FetchFailedError(this.nameForError, keys, message, opts);
			},
		};
	}

	private get nameForError() {
		return `QuantumCache[${this.name}]`;
	}

	/**
	 * The number of items currently in memory.
	 * This applies to the local subset view, not the cross-cluster cache state.
	 */
	public get size() {
		return this.memoryCache.size;
	}

	/**
	 * Iterates all [key, value] pairs in memory.
	 * This applies to the local subset view, not the cross-cluster cache state.
	 */
	[Symbol.iterator](): Iterator<[key: string, value: T]> {
		return this.entries();
	}

	/**
	 * Iterates all [key, value] pairs in memory.
	 * This applies to the local subset view, not the cross-cluster cache state.
	 */
	@bindThis
	public *entries(): Generator<[key: string, value: T]> {
		for (const entry of this.memoryCache.entries) {
			yield [entry[0], entry[1].value];
		}
	}

	/**
	 * Iterates all keys in memory.
	 * This applies to the local subset view, not the cross-cluster cache state.
	 */
	@bindThis
	public *keys() {
		for (const entry of this.memoryCache.entries) {
			yield entry[0];
		}
	}

	/**
	 * Iterates all values pairs in memory.
	 * This applies to the local subset view, not the cross-cluster cache state.
	 */
	@bindThis
	public *values() {
		for (const entry of this.memoryCache.entries) {
			yield entry[1].value;
		}
	}

	/**
	 * Creates or updates a value in the cache, and erases any stale caches across the cluster.
	 * Emits a changed event after the cache has been updated in all processes.
	 * Skips if the value is unchanged.
	 */
	@bindThis
	public async set(key: string, value: T): Promise<void> {
		this.throwIfDisposed();

		if (this.memoryCache.get(key) === value) {
			return;
		}

		this.memoryCache.set(key, value);

		await this.internalEventService.emit('quantumCacheUpdated', { name: this.name, keys: [key] });
		await this.eventSource.emit('changed', { ...this.callbackMeta, keys: [key] });
	}

	/**
	 * Creates or updates multiple value in the cache, and erases any stale caches across the cluster.
	 * Emits a changed for each changed item event after the cache has been updated in all processes.
	 * Skips if all values are unchanged.
	 */
	@bindThis
	public async setMany(items: Iterable<readonly [key: string, value: T]>): Promise<void> {
		this.throwIfDisposed();

		const changedKeys: string[] = [];

		for (const item of items) {
			if (this.memoryCache.get(item[0]) !== item[1]) {
				changedKeys.push(item[0]);
				this.memoryCache.set(item[0], item[1]);
			}
		}

		if (changedKeys.length > 0) {
			await this.internalEventService.emit('quantumCacheUpdated', { name: this.name, keys: changedKeys });
			await this.eventSource.emit('changed', { ...this.callbackMeta, keys: changedKeys });
		}
	}

	/**
	 * Adds a value to the local memory cache without notifying other process.
	 * Neither a Redis event nor changed callback will be fired, as the value has not actually changed.
	 * This should only be used when the value is known to be current, like after fetching from the database.
	 */
	@bindThis
	public add(key: string, value: T): void {
		this.throwIfDisposed();

		this.memoryCache.set(key, value);
	}

	/**
	 * Adds multiple values to the local memory cache without notifying other process.
	 * Neither a Redis event nor changed callback will be fired, as the value has not actually changed.
	 * This should only be used when the value is known to be current, like after fetching from the database.
	 */
	@bindThis
	public addMany(items: Iterable<readonly [key: string, value: T]>): void {
		this.throwIfDisposed();

		for (const [key, value] of items) {
			this.memoryCache.set(key, value);
		}
	}

	/**
	 * Returns true is a key exists in memory.
	 * This applies to the local subset view, not the cross-cluster cache state.
	 */
	@bindThis
	public has(key: string): boolean {
		return this.memoryCache.has(key);
	}

	/**
	 * Gets a value from the local memory cache, or throws KeyNotFoundError if not found.
	 * Returns cached data only - does not make any fetches.
	 */
	@bindThis
	public get(key: string): T {
		const result = this.getMaybe(key);
		if (result === undefined) {
			throw new KeyNotFoundError(this.nameForError, key);
		}
		return result;
	}

	/**
	 * Gets a value from the local memory cache, or returns undefined if not found.
	 * Returns cached data only - does not make any fetches.
	 */
	@bindThis
	public getMaybe(key: string): T | undefined {
		return this.memoryCache.get(key);
	}

	/**
	 * Gets multiple values from the local memory cache; returning undefined for any missing keys.
	 * Returns cached data only - does not make any fetches.
	 */
	@bindThis
	public getMany(keys: Iterable<string>): [key: string, value: T][] {
		const results: [key: string, value: T][] = [];
		for (const key of keys) {
			const value = this.getMaybe(key);
			if (value !== undefined) {
				results.push([key, value]);
			}
		}
		return results;
	}

	/**
	 * Gets or fetches a value from the cache.
	 * Does not emit any events.
	 */
	@bindThis
	public async fetch(key: string): Promise<T> {
		this.throwIfDisposed();

		let value = this.memoryCache.get(key);
		if (value == null) {
			value = await this.doFetch(key);

			this.memoryCache.set(key, value);
		}
		return value;
	}

	/**
	 * Gets or fetches a value from the cache, returning undefined if not found.
	 * Does not emit any events.
	 */
	@bindThis
	public async fetchMaybe(key: string): Promise<T | undefined> {
		this.throwIfDisposed();

		let value = this.memoryCache.get(key);
		if (value != null) {
			return value;
		}

		value = await this.doFetchMaybe(key);
		if (value == null) {
			return undefined;
		}

		this.memoryCache.set(key, value);

		return value;
	}

	/**
	 * Gets or fetches multiple values from the cache.
	 * Missing / unmapped values are excluded from the response.
	 * Does not emit any events.
	 */
	@bindThis
	public async fetchMany(keys: Iterable<string>): Promise<KVPArray<T>> {
		this.throwIfDisposed();

		const results: [key: string, value: T][] = [];
		const toFetch: string[] = [];

		// Spliterate into cached results / uncached keys.
		for (const key of keys) {
			const fromCache = this.getMaybe(key);
			if (fromCache) {
				results.push([key, fromCache]);
			} else {
				toFetch.push(key);
			}
		}

		// Fetch any uncached keys
		if (toFetch.length > 0) {
			const fetched = await this.doFetchMany(toFetch);

			// Add to cache and return set
			this.addMany(fetched);
			results.push(...fetched);
		}

		return makeKVPArray(results);
	}

	/**
	 * Deletes a value from the cache, and erases any stale caches across the cluster.
	 * Emits a changed event after the cache has been updated in all processes.
	 */
	@bindThis
	public async delete(key: string): Promise<void> {
		this.throwIfDisposed();

		this.memoryCache.delete(key);

		await this.internalEventService.emit('quantumCacheUpdated', { name: this.name, keys: [key] });
		await this.eventSource.emit('changed', { ...this.callbackMeta, keys: [key] });
	}
	/**
	 * Deletes multiple values from the cache, and erases any stale caches across the cluster.
	 * Emits a changed event for each key after the cache has been updated in all processes.
	 * Skips if the input is empty.
	 */
	@bindThis
	public async deleteMany(keys: Iterable<string>): Promise<void> {
		this.throwIfDisposed();

		const deletedKeys: string[] = [];

		for (const key of keys) {
			this.memoryCache.delete(key);
			deletedKeys.push(key);
		}

		if (deletedKeys.length === 0) {
			return;
		}

		await this.internalEventService.emit('quantumCacheUpdated', { name: this.name, keys: deletedKeys });
		await this.eventSource.emit('changed', { ...this.callbackMeta, keys: deletedKeys });
	}

	/**
	 * Refreshes the value of a key from the fetcher, and erases any stale caches across the cluster.
	 * Emits a changed event after the cache has been updated in all processes.
	 */
	@bindThis
	public async refresh(key: string): Promise<T> {
		this.throwIfDisposed();

		const value = await this.doFetch(key);
		await this.set(key, value);
		return value;
	}

	/**
	 * Refreshes the value of a key from the fetcher, returning undefined if not found.
	 * Whether a result is found or not, it then erases any stale caches across the cluster.
	 * Emits a changed event after the cache has been updated in all processes.
	 */
	@bindThis
	public async refreshMaybe(key: string): Promise<T | undefined> {
		this.throwIfDisposed();

		const value = await this.doFetchMaybe(key);

		if (value != null) {
			await this.set(key, value);
		} else {
			await this.delete(key);
		}

		return value;
	}

	/**
	 * Refreshes multiple values from the cache, and erases any stale caches across the cluster.
	 * Emits a changed event after the cache has been updated in all processes.
	 * Missing / unmapped values are excluded from the response.
	 */
	@bindThis
	public async refreshMany(keys: Iterable<string>): Promise<KVPArray<T>> {
		this.throwIfDisposed();

		const toFetch = Array.from(keys);
		const fetched = await this.doFetchMany(toFetch);
		await this.setMany(fetched);
		return makeKVPArray(fetched);
	}

	/**
	 * Marks a local cache entry as stale and removes it from memory.
	 * Does not send any events or update other processes.
	 */
	@bindThis
	public drop(key: string): void {
		this.throwIfDisposed();

		this.memoryCache.delete(key);
	}

	/**
	 * Marks multiple local cache entries as stale and removes then from memory.
	 * Does not send any events or update other processes.
	 */
	@bindThis
	public dropMany(keys: Iterable<string>): void {
		this.throwIfDisposed();

		for (const key of keys) {
			this.memoryCache.delete(key);
		}
	}

	/**
	 * Alias to clear()
	 */
	@bindThis
	public dropAll(): void {
		this.clear();
	}

	/**
	 * Erases all entries from the local memory cache.
	 * Does not send any events or update other processes.
	 */
	@bindThis
	public clear(): void {
		this.throwIfDisposed();

		this.memoryCache.clear();
	}

	/**
	 * Erases all entries from the cache.
	 * Emits a reset event and updates other processes.
	 */
	public async reset(): Promise<void> {
		this.throwIfDisposed();

		this.clear();

		await this.internalEventService.emit('quantumCacheReset', { name: this.name });
		await this.eventSource.emit('reset', this.callbackMeta);
	}

	/**
	 * Registers a listener callback for a given event.
	 * Duplicate calls (same event+listener values) will be ignored.
	 *
	 * @param type Event type string.
	 * @param listener Listener callback. If using a method, then make sure it has @bindThis!
	 * @param props Optional properties to configure the binding.
	 */
	@bindThis
	public on<K extends keyof QuantumKVCacheEvents<T>>(type: K, listener: EventListener<QuantumKVCacheEvents<T>, K, EmptyObject>, props?: ListenerProps): void {
		this.eventSource.on(type, listener, props);
	}

	/**
	 * Deregisters (removes) a listener callback for a given event.
	 * Duplicate calls (same event+listener values, or given listener has not been registered) will be ignored.
	 *
	 * @param type Event type string.
	 * @param listener Listener callback. If using an arrow function, then make sure it points to the same exact instance as before!
	 */
	@bindThis
	public off<K extends keyof QuantumKVCacheEvents<T>>(type: K, listener: EventListener<QuantumKVCacheEvents<T>, K, EmptyObject>): void {
		this.eventSource.off(type, listener);
	}

	/**
	 * Shortcut to register a one-off listener for a given event.
	 * See the "on" method for more details.
	 *
	 * @param type Event type string.
	 * @param listener Listener callback. If using a method, then make sure it has @bindThis!
	 * @param props Optional properties to configure the binding, excluding "oneShot".
	 */
	@bindThis
	public once<K extends keyof QuantumKVCacheEvents<T>>(type: K, listener: EventListener<QuantumKVCacheEvents<T>, K, EmptyObject>, props?: ListenerProps & { oneShot: true | undefined | never }): void {
		this.eventSource.once(type, listener, props);
	}

	/**
	 * Removes expired cache entries from the local view.
	 * Does not send any events or update other processes.
	 */
	@bindThis
	public gc(): void {
		this.throwIfDisposed();

		this.memoryCache.gc();
	}

	/**
	 * Erases all data and disconnects from the cluster.
	 * This *must* be called when shutting down to prevent memory leaks!
	 */
	@bindThis
	public async dispose(): Promise<void> {
		if (this.isDisposed) return;
		this.isDisposing = true;

		try {
			// Stop handling events *first*
			this.internalEventService.off('quantumCacheUpdated', this.onQuantumCacheUpdated);
			this.internalEventService.off('quantumCacheReset', this.onQuantumCacheReset);

			// Kill active fetchers
			const error = new DisposingError({ source: this.nameForError });
			this.disposeController.abort(error);

			// Wait for cleanup
			await Promise.allSettled([
				...this.activeFetchers.values(),
				...this.activeOptionalFetchers.values(),
				...this.activeBulkFetchers.values(),
			]);

			// Purge memory for faster GC
			this.activeFetchers.clear();
			this.activeOptionalFetchers.clear();
			this.activeBulkFetchers.clear();
			this.memoryCache.dispose();
		} finally {
			this.isDisposing = false;
			this.isDisposed = true;
		}
	}

	@bindThis
	private async onQuantumCacheUpdated(data: InternalEventTypes['quantumCacheUpdated']): Promise<void> {
		this.throwIfDisposed();

		if (data.name === this.name) {
			for (const key of data.keys) {
				this.memoryCache.delete(key);
			}

			await this.eventSource.emit('changed', { ...this.callbackMeta, keys: data.keys });
		}
	}

	@bindThis
	private async onQuantumCacheReset(data: InternalEventTypes['quantumCacheReset']): Promise<void> {
		this.throwIfDisposed();

		if (data.name === this.name) {
			this.clear();

			await this.eventSource.emit('reset', this.callbackMeta);
		}
	}

	/**
	 * Executes a fetch operation and translates results.
	 * Always uses fetcher().
	 * Concurrent calls for the same key are de-duplicated.
	 */
	@bindThis
	private doFetch(key: string): Promise<Value<T>> {
		// De-duplicate call
		let promise = this.activeFetchers.get(key);
		if (!promise) {
			// Start new call
			const fetchPromise = promiseTry(this.callFetcher, key)
				.catch(async err => {
					if (err instanceof EntityNotFoundError) {
						throw new KeyNotFoundError(this.nameForError, key, renderInlineError(err), { cause: err });
					}

					throw new FetchFailedError(this.nameForError, key, renderInlineError(err), { cause: err });
				})
				.then(async result => {
					if (result == null) {
						throw new KeyNotFoundError(this.nameForError, key);
					}
					return result;
				});

			// Untrack when it finalizes
			const cleanupCallback = async () => {
				if (this.activeFetchers.get(key) === promise) {
					this.activeFetchers.delete(key);
				} else {
					throw new QuantumCacheError(this.nameForError, `Internal error: fetcher race detected for key "${key}"`);
				}
			};
			promise = withCleanup(fetchPromise, cleanupCallback);

			// Track it!!
			this.activeFetchers.set(key, promise);
		}

		return promise;
	}

	/**
	 * Executes a fetchMaybe operation and translates results.
	 * Automatically uses the best available fetch implementation.
	 * Concurrent calls for the same key are de-duplicated.
	 */
	@bindThis
	private doFetchMaybe(key: string): Promise<Value<T> | undefined> {
		// De-duplicate call
		let promise = this.activeOptionalFetchers.get(key);
		if (!promise) {
			// Use optionalFetcher() if available
			if (this.optionalFetcher != null) {
				// Start new call
				const fetchPromise = promiseTry(this.callOptionalFetcher, key)
					.catch(async err => {
						throw new FetchFailedError(this.nameForError, key, renderInlineError(err), { cause: err });
					})
					.then(result => result ?? undefined);

				// Untrack when it finalizes
				const cleanupCallback = async () => {
					if (this.activeOptionalFetchers.get(key) === promise) {
						this.activeOptionalFetchers.delete(key);
					} else {
						throw new QuantumCacheError(this.nameForError, `Internal error: optionalFetcher race detected for key "${key}"`);
					}
				};
				promise = withCleanup(fetchPromise, cleanupCallback);

				// Track it!!
				this.activeOptionalFetchers.set(key, promise);
			} else {
				// Fall back on fetcher() if optionalFetcher() is unavailable
				promise = promiseTry(this.doFetch, key)
					.catch(async err => {
						if (err instanceof KeyNotFoundError) {
							return undefined;
						}

						throw err;
					});
			}
		}

		// Await result
		return promise;
	}

	/**
	 * Executes a fetchMany operation and translates results.
	 * Automatically uses the best available fetch implementation.
	 * Concurrent calls for the same key are de-duplicated.
	 */
	@bindThis
	private doFetchMany(keys: string[]): Promise<[key: string, value: Value<T>][]> {
		const uniqueKeys = new Set(keys);
		const fetcherPromises = new Map<string, ActiveFetcher<T>>();
		const optionalFetcherPromises = new Map<string, ActiveOptionalFetcher<T>>();
		const bulkFetcherPromises = new Set<ActiveBulkFetcher<T>>();
		const remainingKeys: string[] = [];

		// If any keys are covered by an active promise, then re-use it to avoid duplicate fetches.
		for (const key of uniqueKeys) {
			// Re-use an optionalFetcher() call
			const optionalPromise = this.activeOptionalFetchers.get(key);
			if (optionalPromise) {
				optionalFetcherPromises.set(key, optionalPromise);
				continue;
			}

			// Re-use a fetcher() call
			const fetchPromise = this.activeFetchers.get(key);
			if (fetchPromise) {
				fetcherPromises.set(key, fetchPromise);
				continue;
			}

			// Re-use a bulkFetcher() call
			const bulkPromise = this.activeBulkFetchers.get(key);
			if (bulkPromise) {
				bulkFetcherPromises.add(bulkPromise);
				continue;
			}

			// Queue up for a new bulkFetcher() call
			remainingKeys.push(key);
		}

		// Start a new fetch for any keys that weren't already covered.
		if (hasAtLeastOne(remainingKeys)) {
			if (remainingKeys.length > 1 && this.bulkFetcher != null) {
				// Use the bulk fetcher if available
				const promise = this.callBulkFetcherWithTracking(remainingKeys);
				bulkFetcherPromises.add(promise);
			} else {
				// Otherwise fall back to single fetcher
				for (const key of remainingKeys) {
					const promise = this.doFetchMaybe(key);
					optionalFetcherPromises.set(key, promise);
				}
			}
		}

		return Promise
			// Wrap all promises into a common shape
			.allSettled<KeyValue<T>[]>([
				...fetcherPromises
					.entries()
					.map(([key, promise]) => promise
						.catch(async err => {
							if (err instanceof KeyNotFoundError) {
								return undefined;
							}
							throw err;
						})
						.then(value => {
							if (value === undefined) {
								return [];
							}
							return [[key, value]] as KeyValue<T>[];
						})),
				...optionalFetcherPromises
					.entries()
					.map(([key, promise]) => promise.then(value => {
						if (value === undefined) {
							return [];
						}
						return [[key, value]] as KeyValue<T>[];
					})),
				...bulkFetcherPromises,
			])
			// Unpack results and handle errors
			.then(async promiseResults => {
				const results: KeyValue<T>[][] = [];
				const errors: unknown[] = [];

				for (const pr of promiseResults) {
					if (pr.status === 'fulfilled') {
						results.push(pr.value);
					} else {
						errors.push(pr.reason);
					}
				}

				if (errors.length === 1) {
					const innerException = errors[0];
					throw new FetchFailedError(this.nameForError, keys, renderInlineError(innerException), { cause: innerException });
				} else if (errors.length > 1) {
					const innerException = new AggregateError(errors);
					throw new FetchFailedError(this.nameForError, keys, 'Multiple exceptions thrown; see inner exception (cause) for details', { cause: innerException });
				}

				return results.flat();
			});
	}

	/**
	 * Calls fetcher().
	 * Do not call this directly - use doFetch() instead!
	 */
	@bindThis
	private callFetcher(key: string): Promise<T | null | undefined> {
		// Safety check, in case this gets called directly by mistake
		this.throwIfDisposed();
		if (this.activeFetchers.has(key)) {
			throw new QuantumCacheError(this.nameForError, `Internal error: attempted to call fetcher multiple times for key "${key}"`);
		}

		const meta = this.getCallbackMetaForFetch(key);

		// Start limiter cascade
		return this.globalLimiter(async () => {
			this.throwIfDisposed();

			return await this.fetcherLimiter(async () => {
				this.throwIfDisposed();

				return await withSignal(
					// Execute callback and adapt results
					async () => await this.fetcher(key, meta),

					// Bind abort signal in case fetcher stalls out
					this.disposeController.signal,
				);
			});
		});
	}

	/**
	 * Calls optionalFetcher().
	 * Do not call this directly - use doFetchMaybe() instead!
	 */
	@bindThis
	private callOptionalFetcher(key: string): Promise<T | null | undefined> {
		// Safety checks, in case this gets called directly by mistake
		this.throwIfDisposed();
		const optionalFetcher = this.optionalFetcher;
		if (optionalFetcher == null) {
			throw new QuantumCacheError(this.nameForError, 'Internal error: attempted to call optionalFetcher for a cache that doesn\'t support it');
		}
		if (this.activeOptionalFetchers.has(key)) {
			throw new QuantumCacheError(this.nameForError, `Internal error: attempted to call optionalFetcher multiple times for key "${key}"`);
		}

		const meta = this.getCallbackMetaForFetch(key);

		// Start limiter cascade
		return this.globalLimiter(async () => {
			this.throwIfDisposed();

			return await this.optionalFetcherLimiter(async () => {
				this.throwIfDisposed();

				return await withSignal(
					// Execute callback and adapt results
					async () => await optionalFetcher(key, meta),

					// Bind abort signal in case fetcher stalls out
					this.disposeController.signal,
				);
			});
		});
	}

	/**
	 * Calls bulkFetcher() and tracks the promise.
	 * Do not call this directly - use doBulkFetch() instead!
	 */
	@bindThis
	private callBulkFetcherWithTracking(keys: AtLeastOne<string>): ActiveBulkFetcher<T> {
		// Start new call
		const fetchPromise = promiseTry(this.callBulkFetcher, keys)
			.then(results => Array.from(results).filter((result): result is KeyValue<T> => {
				return result[1] != null;
			}));

		// Untrack when it finalizes
		const cleanupCallback = async () => {
			const racedKeys: string[] = [];

			for (const key of keys) {
				if (this.activeBulkFetchers.get(key) === promise) {
					this.activeBulkFetchers.delete(key);
				} else {
					racedKeys.push(key);
				}
			}

			if (racedKeys.length > 0) {
				const allKeys = racedKeys.map(k => `"${k}"`).join(', ');
				throw new QuantumCacheError(this.nameForError, `Internal error: bulkFetcher race detected for key(s) ${allKeys}`);
			}
		};
		const promise = withCleanup(fetchPromise, cleanupCallback);

		// Track it!!
		for (const key of keys) {
			this.activeBulkFetchers.set(key, promise);
		}

		return promise;
	}

	/**
	 * Calls bulkFetcher().
	 * Do not call this directly - use bulkFetch() instead!
	 */
	@bindThis
	private callBulkFetcher(keys: AtLeastOne<string>): Promise<Iterable<KeyValue<T | null | undefined>>> {
		// Safety checks, in case this gets called directly by mistake
		const bulkFetcher = this.bulkFetcher;
		this.throwIfDisposed();
		if (bulkFetcher == null) {
			throw new QuantumCacheError(this.nameForError, 'Internal error: attempted to call bulkFetcher for a cache that doesn\'t support it');
		}
		const duplicateKeys = keys.filter(key => this.activeBulkFetchers.has(key));
		if (duplicateKeys.length > 0) {
			const allKeys = duplicateKeys.map(k => `"${k}"`).join(', ');
			throw new QuantumCacheError(this.nameForError, `Internal error: attempted to call bulkFetcher multiple times for key(s) ${allKeys}`);
		}

		const meta = this.getCallbackMetaForFetch(keys);

		// Start limiter cascade
		return this.globalLimiter(async () => {
			this.throwIfDisposed();

			return await this.bulkFetcherLimiter(async () => {
				this.throwIfDisposed();

				return await withSignal(
					// Execute callback and adapt results
					async () => await bulkFetcher(keys, meta),

					// Bind abort signal in case fetcher stalls out
					this.disposeController.signal,
				);
			});
		});
	}

	@bindThis
	private throwIfDisposed() {
		if (this.isDisposing) {
			throw new DisposingError({ source: this.nameForError });
		}
		if (this.isDisposed) {
			throw new DisposedError({ source: this.nameForError });
		}
	}
}

function hasAtLeastOne<T>(array: T[]): array is AtLeastOne<T> {
	return array.length > 0;
}
