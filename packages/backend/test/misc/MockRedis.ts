/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { FakeRedis, ok, type RedisString } from './FakeRedis.js';
import type { RedisKey, RedisNumber, RedisValue, RedisCallback, Ok } from './FakeRedis.js';
import type { ChainableCommander } from 'ioredis';
import { TimeService, NativeTimeService } from '@/global/TimeService.js';
import { bindThis } from '@/decorators.js';

export interface MockRedisConstructor {
	new (timeService?: TimeService): MockRedis;
}

export interface MockRedis extends FakeRedis {
	/**
	 * Gets a key/value entry from the mock, with metadata.
	 * Returns undefined if no value is stored.
	 */
	mockGetEntry(key: RedisKey): MockEntry | undefined;

	/**
	 * Gets a value from the mock, or undefined if no value is stored.
	 */
	mockGet(key: RedisKey): RedisValue | undefined;

	/**
	 * Deletes a value from the mock.
	 * Does nothing if the value doesn't exist.
	 */
	mockDel(key: RedisKey): void;

	/**
	 * Sets a value in the mock, replacing any prior value.
	 * Expiration, if provided, should be in milliseconds since the Unix epoch.
	 */
	mockSet(key: RedisKey, value: RedisValue, expiration?: number | null): void;

	/**
	 * Resets the mock to initial state.
	 */
	mockReset(): void;
}

export interface MockEntry {
	key: RedisKey;
	value: RedisValue;
	expiration: number | null;
}

/** TODO implement the other commands */
class MockTransactionImpl extends FakeRedis {
	private readonly commands: [keyof MockRedis, ...unknown[]][];

	get length() {
		return this.commands.length;
	}

	constructor(
		private readonly mockRedis: MockRedis,
		commands: unknown[][] = [],
	) {
		super();
		this.commands = commands.map(([command, ...args]) => ([
			String(command).toLowerCase() as keyof MockRedis,
			...args,
		]));
	}

	@bindThis
	public async exec(callback?: RedisCallback<[error: Error | null, result: unknown][] | null>): Promise<[error: Error | null, result: unknown][] | null> {
		const results: [error: Error | null, result: unknown][] = [];

		for (const [command, ...args] of this.commands) {
			try {
				const res = await (this.mockRedis[command] as (...args: unknown[]) => Promise<unknown>)(...args);
				results.push([null, res]);
			} catch (err) {
				const error = err instanceof Error ? err : new Error('Unknown error', { cause: err });
				results.push([error, undefined]);
			}
		}

		callback?.(null, results);
		return results;
	}
}

const MockTransaction = MockTransactionImpl as unknown as {
	new (mockRedis: unknown, commands?: unknown[][]): ChainableCommander;
};

/**
 * Mock implementation of Redis that works in-memory and exposes functions to manipulate the values.
 * Throws on any unsupported operation, and never actually connects.
 */
export const MockRedis: MockRedisConstructor = createMockRedis();

function createMockRedis(): MockRedisConstructor {
	@Injectable()
	class MockRedis extends FakeRedis implements MockRedis {
		private readonly timeService: TimeService;
		private readonly mockData = new Map<string, MockEntry>(); // redis data
		private readonly mockEvents = new EventManager(); // on/of/once listeners
		private readonly mockChannels = new Set<string>(); // subscribed pub/sub channels

		constructor(timeService?: TimeService) {
			super();
			this.timeService = timeService ?? new NativeTimeService();
		}

		@bindThis
		mockGetEntry(key: RedisKey): MockEntry | undefined {
			const mapped = mapKey(key);

			let entry = this.mockData.get(mapped);
			if (entry?.expiration && entry.expiration <= this.timeService.now) {
				this.mockDel(key);
				entry = undefined;
			}

			return entry;
		}

		@bindThis
		mockGet(key: RedisKey): RedisValue | undefined {
			const entry = this.mockGetEntry(key);
			return entry?.value;
		}

		@bindThis
		mockDel(key: RedisKey): void {
			const mapped = mapKey(key);
			this.mockData.delete(mapped);
		}

		@bindThis
		mockSet(key: RedisKey, value: RedisValue, expiration: number | null = null): void {
			const mapped = mapKey(key);
			this.mockData.set(mapped, {
				expiration,
				value,
				key,
			});
		}

		@bindThis
		mockReset(): void {
			this.mockChannels.clear();
			this.mockEvents.clear();
			this.mockData.clear();
		}

		@bindThis
		dispose(): void {
			this.mockEvents.dispose();
			this.mockReset();
		}

		@bindThis
		public once(ev: string, callback: AnyCallback): this {
			this.mockEvents.once(ev, callback);
			return this;
		}

		@bindThis
		public on(ev: string, callback: AnyCallback): this {
			this.mockEvents.on(ev, callback);
			return this;
		}

		@bindThis
		public off(ev: string, callback: AnyCallback): this {
			this.mockEvents.off(ev, callback);
			return this;
		}

		@bindThis
		public async subscribe(...args: (RedisString | RedisCallback)[]): Promise<unknown> {
			const callback = args
				.find(a => typeof(a) === 'function');
			const channels = args
				.filter(a => typeof(a) !== 'function')
				.flat()
				.map(s => parseString(s));

			for (const channel of channels) {
				this.mockChannels.add(channel);
			}

			callback?.(null, ok);
			return ok;
		}

		@bindThis
		public async unsubscribe(...args: (RedisString | RedisCallback | undefined)[]): Promise<unknown> {
			const callback = args
				.find(a => typeof(a) === 'function');
			const channels = args
				.filter(a => typeof(a) !== 'function')
				.flat()
				.filter(s => s != null)
				.map(s => parseString(s));

			for (const channel of channels) {
				this.mockChannels.delete(channel);
			}

			callback?.(null, ok);
			return ok;
		}

		@bindThis
		public async publish(channel: RedisString, message: RedisString, callback?: RedisCallback<number>): Promise<number> {
			const channelString = parseString(channel);
			if (!this.mockChannels.has(channelString)) {
				callback?.(null, 0);
				return 0;
			}

			if (Buffer.isBuffer(message)) {
				channel = Buffer.from(channel);
				this.mockEvents.emit('messageBuffer', channel, message);
			} else {
				message = parseString(message);
				this.mockEvents.emit('message', channelString, message);
			}

			callback?.(null, 1);
			return 1;
		}

		@bindThis
		public pipeline(commands?: unknown[][]): ChainableCommander {
			return this.multi(commands);
		}

		public multi(options: { pipeline: false }): Promise<Ok>;
		public multi(options: { pipeline: true }): ChainableCommander;
		public multi(commands?: unknown[][]): ChainableCommander;
		@bindThis
		public multi(commandsOrOptions?: unknown[][] | { pipeline: boolean }): Promise<Ok> | ChainableCommander {
			if (Array.isArray(commandsOrOptions)) {
				return new MockTransaction(this, commandsOrOptions);
			} else if (commandsOrOptions == null || commandsOrOptions.pipeline) {
				return new MockTransaction(this);
			} else {
				return Promise.resolve(ok);
			}
		}

		@bindThis
		public async get(key: RedisKey, callback?: RedisCallback<string | null>): Promise<string | null> {
			let value = this.mockGet(key);

			// Emulate implicit casts
			if (typeof(value) === 'number') {
				value = String(value);
			}

			if (value != null && typeof(value) !== 'string') {
				const err = new Error('get failed: cannot GET a non-string value');
				callback?.(err);
				throw err;
			}

			callback?.(null, value ?? null);
			return value ?? null;
		}

		@bindThis
		public async getBuffer(key: RedisKey, callback?: RedisCallback<Buffer | null>): Promise<Buffer | null> {
			let value = this.mockGet(key);

			// Emulate implicit casts
			if (typeof(value) === 'number') {
				value = String(value);
			}

			if (value != null && !Buffer.isBuffer(value)) {
				const err = new Error('getBuffer failed: cannot GET a non-buffer value');
				callback?.(err);
				throw err;
			}

			callback?.(null, value ?? null);
			return value ?? null;
		}

		@bindThis
		public async getDel(key: RedisKey, callback?: RedisCallback<string | null>): Promise<string | null> {
			let value = this.mockGet(key);

			// Emulate implicit casts
			if (typeof(value) === 'number') {
				value = String(value);
			}

			if (value != null && typeof(value) !== 'string') {
				const err = new Error('getDel failed: cannot GETDEL a non-string value');
				callback?.(err);
				throw err;
			}

			this.mockDel(key);

			callback?.(null, value ?? null);
			return value ?? null;
		}

		@bindThis
		public async getDelBuffer(key: RedisKey, callback?: RedisCallback<Buffer | null>): Promise<Buffer | null> {
			const value = this.mockGet(key);

			if (value != null && !Buffer.isBuffer(value)) {
				const err = new Error('getDelBuffer failed: cannot GETDEL a non-string value');
				callback?.(err);
				throw err;
			}

			this.mockDel(key);

			callback?.(null, value ?? null);
			return value ?? null;
		}

		@bindThis
		public async getSet(key: RedisKey, newValue: RedisValue, callback?: RedisCallback<string | null>): Promise<string | null> {
			const oldValue = this.mockGet(key);

			if (oldValue != null && typeof(oldValue) !== 'string') {
				const err = new Error('getSet failed: cannot GETSET a non-string value');
				callback?.(err);
				throw err;
			}

			this.mockSet(key, newValue);

			callback?.(null, oldValue ?? null);
			return oldValue ?? null;
		}

		@bindThis
		public async getSetBuffer(key: RedisKey, newValue: RedisValue, callback?: RedisCallback<Buffer | null>): Promise<Buffer | null> {
			const oldValue = this.mockGet(key);

			if (oldValue != null && !Buffer.isBuffer(oldValue)) {
				const err = new Error('getSetBuffer failed: cannot GETSET a non-string value');
				callback?.(err);
				throw err;
			}

			this.mockSet(key, newValue);

			callback?.(null, oldValue ?? null);
			return oldValue ?? null;
		}

		@bindThis
		public async del(...args: (RedisKey | RedisKey[] | RedisCallback<number> | undefined)[]): Promise<number> {
			const callback = args.find(a => typeof(a) === 'function');
			const keys = args.filter(a => typeof(a) !== 'function').flat();

			let total = 0;
			for (const key of keys) {
				if (key == null) {
					continue;
				}

				const entry = this.mockGet(key);
				if (entry) {
					total++;
					this.mockDel(key);
				}
			}

			callback?.(null, total);
			return total;
		}

		@bindThis
		public async incr(key: RedisKey, callback?: RedisCallback<number>): Promise<number> {
			return await this.incrCommon(key, 1, true, 'incr', callback);
		}

		@bindThis
		public async incrby(key: RedisKey, increment: RedisNumber, callback?: RedisCallback<number>): Promise<number> {
			return await this.incrCommon(key, increment, true, 'incrby', callback);
		}

		@bindThis
		public async decr(key: RedisKey, callback?: RedisCallback<number>): Promise<number> {
			return await this.incrCommon(key, 1, false, 'decr', callback);
		}

		@bindThis
		public async decrby(key: RedisKey, increment: RedisNumber, callback?: RedisCallback<number>): Promise<number> {
			return await this.incrCommon(key, increment, false, 'decrby', callback);
		}

		@bindThis
		private async incrCommon(key: RedisKey, increment: RedisNumber, add: boolean, func: string, callback?: RedisCallback<number>): Promise<number> {
			// Parse the increment
			const inc = parseNumber(increment);
			if (inc == null) {
				const err = new Error(`${func} failed: cannot parse increment as integer`);
				callback?.(err);
				throw err;
			}

			// Extract and verify the value
			const entry = this.mockGetEntry(key);
			let value = entry != null ? parseNumber(entry.value) : 0;
			if (value == null) {
				const err = new Error(`${func} failed: cannot ${func.toUpperCase()} a non-number value`);
				callback?.(err);
				throw err;
			}

			// Apply the increment
			if (add) {
				value += inc;
			} else {
				value -= inc;
			}

			// Update, but preserve expiration
			this.mockSet(key, value, entry?.expiration);

			callback?.(null, value);
			return value;
		}

		expire(key: RedisKey, seconds: RedisNumber, callback?: RedisCallback<number>): Promise<number>;
		expire(key: RedisKey, seconds: RedisNumber, flag: 'NX', callback?: RedisCallback<number>): Promise<number>;
		expire(key: RedisKey, seconds: RedisNumber, flag: 'XX', callback?: RedisCallback<number>): Promise<number>;
		expire(key: RedisKey, seconds: RedisNumber, flag: 'GT', callback?: RedisCallback<number>): Promise<number>;
		expire(key: RedisKey, seconds: RedisNumber, flag: 'LT', callback?: RedisCallback<number>): Promise<number>;
		@bindThis
		public async expire(key: RedisKey, seconds: RedisNumber, callbackOrFlag?: RedisCallback<number> | 'NX' | 'XX' | 'GT' | 'LT', orCallback?: RedisCallback<number>): Promise<number> {
			const flag = typeof(callbackOrFlag) === 'string' ? callbackOrFlag : null;
			const callback = typeof(callbackOrFlag) === 'function' ? callbackOrFlag : orCallback;

			const expiresSec = parseNumber(seconds);
			if (expiresSec == null) {
				const err = new Error('expire failed: cannot parse seconds as integer');
				callback?.(err);
				throw err;
			}

			// Non-positive expires should execute DEL instead.
			// https://redis.io/docs/latest/commands/expire
			if (expiresSec < 1) {
				return await this.del(key, callback);
			}

			const entry = this.mockGetEntry(key);
			if (!entry) {
				callback?.(null, 0);
				return 0;
			}

			if (flag === 'NX' && entry.expiration != null) {
				callback?.(null, 0);
				return 0;
			}

			if (flag === 'XX' && entry.expiration == null) {
				callback?.(null, 0);
				return 0;
			}

			const expiresAt = this.timeService.now + (expiresSec * 1000);
			if (entry.expiration != null) {
				if (flag === 'GT' && expiresAt <= entry.expiration) {
					callback?.(null, 0);
					return 0;
				}

				if (flag === 'LT' && expiresAt >= entry.expiration) {
					callback?.(null, 0);
					return 0;
				}
			}

			// Success! update it
			entry.expiration = expiresAt;
			callback?.(null, 1);
			return 1;
		}

		@bindThis
		public async setex(key: RedisKey, seconds: RedisNumber, value: RedisValue, callback?: RedisCallback<Ok>): Promise<Ok> {
			await this.set(key, value, 'EX', seconds);
			callback?.(null, ok);
			return ok;
		}

		@bindThis
		public async setnx(key: RedisKey, value: RedisValue, callback?: RedisCallback<number>): Promise<number> {
			const ok = await this.set(key, value, 'NX');
			callback?.(null, ok ? 1 : 0);
			return ok ? 1 : 0;
		}

		@bindThis
		// @ts-expect-error This comes from collapsing all the overload signatures, but it's fine.
		public async set(
			key: RedisKey,
			value: RedisValue,
			op1?: SetOp1 | RedisCallback<Ok | string | null>,
			op2?: SetOp2 | SetArg | RedisCallback<Ok | string | null>,
			op3?: SetOp3 | SetArg | RedisCallback<Ok | string | null>,
			op4?: SetArg | RedisCallback<Ok | string | null>,
			op5?: RedisCallback<Ok | string | null>,
		): Promise<Ok | string | null> {
			const entry = this.mockGetEntry(key);

			// Parse ops
			const { nx, ex, get, cb, err } = this._parseSetOps(entry ?? null, [op1, op2, op3, op4, op5]);

			// Additional error from the "GET" flag
			if (get && entry != null && typeof(entry.value) !== 'string') {
				err.push(new Error('set failed: cannot GET a non-string value.'));
			}

			// Abort on errors
			if (err.length > 1) {
				const agg = new AggregateError(err, 'set failed: see "errors" property for details.');
				if (cb) cb(agg);
				throw agg;
			} else if (err.length > 0) {
				if (cb) cb(err[0]);
				throw err[0];
			}

			// Emulate the "NX" and "XX" flags
			const nxLock =
				(nx === true && entry != null) || // NX - skip if the key already exists (Never eXchange)
				(nx === false && entry == null); // XX - skip the key *doesn't* exist (eXclusively eXchange)

			// Compute return value for the operation
			const ret = get
				? entry // Return the previous value or null for GET
					? parseString(entry.value)
					: null
				: nxLock
					? null // Return null if locked out by NX or XX
					: ok; // Otherwise return ok, even if we don't set it.

			// Write *after* we compute the return value!
			const doWrite = !nxLock;
			if (doWrite) {
				this.mockSet(key, value, ex);
			}

			// Return the results
			if (cb) cb(null, ret);
			return ret;
		}

		@bindThis
		private _parseSetOps(entry: MockEntry | null, ops: SetOp[]) {
			const err: Error[] = [];
			let ex: number | null | undefined;
			let nx: boolean | null = null;
			let get = false;
			let cb: RedisCallback<Ok | string | null> | null = null;

			// Slide through it til we reach the end
			let nextIsParam = false;
			for (let i = 0; i < ops.length && ops[i] != null; i++) {
				// This is set when one of the ops consumed the next token as an argument.
				if (nextIsParam) {
					nextIsParam = false;
					continue;
				}

				const opRaw = ops[i];
				const op = typeof(opRaw) === 'function' ? opRaw : parseString(opRaw);

				const argRaw = ops[i + 1];
				const arg = typeof(argRaw) === 'function' ? argRaw : parseNumber(argRaw);

				if (typeof(op) === 'function') {
					cb = op as RedisCallback<Ok | string | null>;
				} else if (op === 'KEEPTTL') {
					ex = entry?.expiration;
				} else if (op === 'GET') {
					get = true;
				} else if (op === 'NX') {
					nx = true;
				} else if (op === 'XX') {
					nx = false;
				} else if (op === 'EX') {
					nextIsParam = true;
					if (arg == null) {
						err.push(new Error('Missing required argument for set "EX" parameter'));
					} else if (typeof(arg) !== 'number') {
						err.push(new Error('Invalid argument for set "EX" parameter: must be a number'));
					} else if (arg < 0) {
						err.push(new Error('Invalid argument for set "EX" parameter: must be a positive integer'));
					} else {
						ex = this.timeService.now + (arg * 1000);
					}
				} else if (op === 'PX') {
					nextIsParam = true;
					if (arg == null) {
						err.push(new Error('Missing required argument for set "EX" parameter'));
					} else if (typeof(arg) !== 'number') {
						err.push(new Error('Invalid argument for set "EX" parameter: must be a number'));
					} else if (arg < 0) {
						err.push(new Error('Invalid argument for set "EX" parameter: must be a positive integer'));
					} else {
						ex = this.timeService.now + arg;
					}
				} else if (op === 'EXAT') {
					nextIsParam = true;
					if (arg == null) {
						err.push(new Error('Missing required argument for set "EX" parameter'));
					} else if (typeof(arg) !== 'number') {
						err.push(new Error('Invalid argument for set "EX" parameter: must be a number'));
					} else if (arg < 0) {
						err.push(new Error('Invalid argument for set "EX" parameter: must be a positive integer'));
					} else {
						ex = arg * 1000;
					}
				} else if (op === 'PXAT') {
					nextIsParam = true;
					if (arg == null) {
						err.push(new Error('Missing required argument for set "EX" parameter'));
					} else if (typeof(arg) !== 'number') {
						err.push(new Error('Invalid argument for set "EX" parameter: must be a number'));
					} else if (arg < 0) {
						err.push(new Error('Invalid argument for set "EX" parameter: must be a positive integer'));
					} else {
						ex = arg;
					}
				} else {
					err.push(new Error(`Unknown parameter for set: "${op}"`));
				}
			}

			return { ex, nx, get, cb, err };
		}
	}

	return MockRedis as unknown as MockRedisConstructor;
}

function mapKey(key: RedisKey): string {
	const prefix = Buffer.isBuffer(key) ? 'b' : 's';
	const mapped = parseString(key);
	return `${prefix}:${mapped}`;
}

function parseNumber(value: RedisValue | undefined): number | undefined;
function parseNumber(value: RedisValue | null | undefined): number | null | undefined;

function parseNumber(value: RedisValue | null | undefined): number | null | undefined {
	if (value == null) {
		return value;
	}

	if (typeof(value) !== 'number') {
		value = parseString(value);
		value = parseInt(value);
	}

	if (!Number.isSafeInteger(value)) {
		return undefined;
	}

	if (Number.isNaN(value)) {
		return undefined;
	}

	return value;
}

function parseString(value: RedisValue): string;
function parseString(value: RedisValue | null): string | null;
function parseString(value: RedisValue | undefined): string | undefined;
function parseString(value: RedisValue | null | undefined): string | null | undefined;

function parseString(value: RedisValue | null | undefined): string | null | undefined {
	if (value == null) {
		return value;
	}

	if (Buffer.isBuffer(value)) {
		return value.toString('utf-8');
	}

	return String(value);
}

type SetOp = SetOp1 | SetOp2 | SetOp3 | SetArg | undefined;
type SetOp1 = SetOp2 | 'NX' | 'XX';
type SetOp2 = SetOp3 | 'GET';
type SetOp3 = 'EX' | 'PX' | 'EXAT' | 'PXAT' | 'KEEPTTL';
type SetArg = RedisNumber | RedisCallback<Ok | string | null>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCallback = (...args: any[]) => any;

class EventManager {
	private readonly groups = new Map<string, EventGroup>();

	public emit(ev: string, ...args: unknown[]) {
		this.groups.get(ev)?.emit(args);
	}

	@bindThis
	public once(ev: string, callback: AnyCallback) {
		this.on(ev, (...args: unknown[]) => {
			this.off(ev, callback);
			callback(...args);
		});
	}

	@bindThis
	public on(ev: string, callback: AnyCallback) {
		this.makeEvent(ev).add(callback);
	}

	@bindThis
	public off(ev: string, callback: AnyCallback) {
		this.groups.get(ev)?.remove(callback);
	}

	private makeEvent(ev: string): EventGroup {
		let group = this.groups.get(ev);
		if (!group) {
			group = new EventGroup(ev);
			this.groups.set(ev, group);
		}
		return group;
	}

	@bindThis
	public clear() {
		for (const group of this.groups.values()) {
			group.clear();
		}

		this.groups.clear();
	}

	@bindThis
	public dispose() {
		for (const group of this.groups.values()) {
			group.dispose();
		}

		this.clear();
	}
}

class EventGroup {
	private readonly listeners = new Set<AnyCallback>();

	constructor(
		public readonly ev: string,
	) {}

	public add(listener: AnyCallback): void {
		this.listeners.add(listener);
	}

	public remove(listener: AnyCallback): void {
		this.listeners.delete(listener);
	}

	public emit(...args: unknown[]): void {
		for (const listener of this.listeners) {
			listener(...args);
		}
	}

	public clear() {
		this.listeners.clear();
	}

	public dispose() {
		this.clear();
	}
}
