/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Redis as RedisConstructor } from 'ioredis';
import type * as Redis from 'ioredis';

export type RedisKey = Redis.RedisKey;
export type RedisString = Buffer | string;
export type RedisNumber = string | number;
export type RedisValue = RedisKey | RedisString | RedisNumber;
export type RedisCallback<T = unknown> = Redis.Callback<T>;

export type Ok = 'OK';
export const ok = 'OK' as const;

export type FakeRedis = RedisConstructor;
export interface FakeRedisConstructor {
	new (): FakeRedis;
}

/**
 * Fake implementation of Redis that pretends to connect but throws on any operation.
 */
export const FakeRedis: FakeRedisConstructor = createFakeRedis();

function createFakeRedis(): FakeRedisConstructor {
	class FakeRedis implements Partial<RedisConstructor> {
		async connect(callback?: RedisCallback<void>): Promise<void> {
			// no-op
			callback?.(null);
		}

		async hello(...callbacks: (undefined | string | number | Buffer | RedisCallback<unknown[]>)[]): Promise<unknown[]> {
			// no-op
			const callback = callbacks.find(c => typeof(c) === 'function');
			callback?.(null, []);
			return [];
		}

		async auth(...callbacks: (undefined | string | Buffer | RedisCallback<Ok>)[]): Promise<Ok> {
			const callback = callbacks.find(c => typeof(c) === 'function');
			callback?.(null, ok);
			return ok;
		}

		async quit(callback?: RedisCallback<Ok>) {
			// no-op
			callback?.(null, ok);
			return ok;
		}

		async save(callback?: RedisCallback<Ok>) {
			// no-op
			callback?.(null, ok);
			return ok;
		}

		async sync(callback?: RedisCallback<Ok>) {
			// no-op
			callback?.(null, ok);
			return ok;
		}

		disconnect(): void {
			// no-op
		}

		end(): void {
			// no-op
		}
	}

	const fakeProto = FakeRedis.prototype as Partial<RedisConstructor>;
	const redisProto = RedisConstructor.prototype as Partial<RedisConstructor>;

	// Override all methods and accessors from Redis
	for (const [key, property] of allProps(redisProto)) {
		// Skip anything already defined
		if (Reflect.has(fakeProto, key)) {
			continue;
		}

		if (property.get || property.set) {
			// Stub accessors
			Reflect.defineProperty(fakeProto, key, {
				...property,
				get: property.get ? stub(property.get.name || key) : undefined,
				set: property.set ? stub(property.set.name || key) : undefined,
			});
		} else if (property.value && typeof(property.value) === 'function') {
			// Stub methods
			Reflect.defineProperty(fakeProto, key, {
				...property,
				value: stub(property.value.name || key),
			});
		}
	}

	// Fixup protoype
	Reflect.setPrototypeOf(fakeProto, redisProto);

	// test
	const test = new FakeRedis();
	if (!(test instanceof RedisConstructor)) {
		throw new Error('failed to extend');
	}

	return FakeRedis as FakeRedisConstructor;
}

function *allProps(obj: object | null): Generator<[PropertyKey, PropertyDescriptor]> {
	while (obj != null) {
		for (const key of Reflect.ownKeys(obj)) {
			const prop = Reflect.getOwnPropertyDescriptor(obj, key);
			if (prop) {
				yield [key, prop];
			}
		}

		obj = Object.getPrototypeOf(obj);
	}
}

function stub(name: PropertyKey) {
	if (typeof(name) === 'symbol') {
		name = `[symbol.${name.description || '<anonymous>'}]`;
	} else if (typeof(name) === 'number') {
		name = String(name);
	}

	const stub = () => {
		throw new Error(`Not Implemented: MockRedis does not support ${name}`);
	};

	// Make the stub match the original name
	Object.defineProperty(stub, 'name', {
		writable: false,
		enumerable: false,
		configurable: true,
		value: name,
	});

	return stub;
}
