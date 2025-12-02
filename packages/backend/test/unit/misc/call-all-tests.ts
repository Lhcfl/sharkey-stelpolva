/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import * as assert from '../../misc/custom-assertions.js';
import { callAll, callAllOn, callAllAsync, callAllOnAsync } from '@/misc/call-all.js';

describe(callAll, () => {
	it('should call all functions when all succeed', () => {
		const funcs = [
			jest.fn(() => {}),
			jest.fn(() => {}),
			jest.fn(() => {}),
		];

		callAll(funcs);

		for (const func of funcs) {
			expect(func).toHaveBeenCalledTimes(1);
		}
	});

	it('should pass parameters to all functions', () => {
		const funcs = [
			jest.fn((num: number) => expect(num).toBe(1)),
			jest.fn((num: number) => expect(num).toBe(1)),
			jest.fn((num: number) => expect(num).toBe(1)),
		];

		callAll(funcs, 1);
	});

	it('should call all functions when some fail', () => {
		const funcs = [
			jest.fn(() => { throw new Error(); }),
			jest.fn(() => {}),
			jest.fn(() => {}),
		];

		try {
			callAll(funcs);
		} catch {
			// ignore
		}

		for (const func of funcs) {
			expect(func).toHaveBeenCalledTimes(1);
		}
	});

	it('should throw when some functions fail', () => {
		const funcs = [
			jest.fn(() => { throw new Error(); }),
			jest.fn(() => {}),
			jest.fn(() => {}),
		];

		assert.throws(AggregateError, () => {
			callAll(funcs);
		});
	});

	it('should not throw when input is empty', () => {
		expect(() => callAll([])).not.toThrow();
	});
});

describe(callAllAsync, () => {
	it('should call all functions when all succeed', async () => {
		const funcs = [
			jest.fn(() => Promise.resolve()),
			jest.fn(() => Promise.resolve()),
			jest.fn(() => Promise.resolve()),
		];

		await callAllAsync(funcs);

		for (const func of funcs) {
			expect(func).toHaveBeenCalledTimes(1);
		}
	});

	it('should pass parameters to all functions', async () => {
		const funcs = [
			jest.fn((num: number) => expect(num).toBe(1)),
			jest.fn((num: number) => expect(num).toBe(1)),
			jest.fn((num: number) => expect(num).toBe(1)),
		];

		await callAllAsync(funcs, 1);
	});

	it('should call all functions when some fail', async () => {
		const funcs = [
			jest.fn(() => Promise.reject(new Error())),
			jest.fn(() => Promise.resolve()),
			jest.fn(() => Promise.resolve()),
		];

		try {
			await callAllAsync(funcs);
		} catch {
			// ignore
		}

		for (const func of funcs) {
			expect(func).toHaveBeenCalledTimes(1);
		}
	});

	it('should throw when some functions fail', async () => {
		const funcs = [
			jest.fn(() => Promise.reject(new Error())),
			jest.fn(() => Promise.resolve()),
			jest.fn(() => Promise.resolve()),
		];

		await assert.throwsAsync(AggregateError, async () => {
			await callAllAsync(funcs);
		});
	});

	it('should not throw when input is empty', async () => {
		await callAllAsync([]);
	});
});

describe(callAllOn, () => {
	it('should call all methods when all succeed', () => {
		const objects = [
			{ foo: jest.fn(() => {}) },
			{ foo: jest.fn(() => {}) },
			{ foo: jest.fn(() => {}) },
		];

		callAllOn(objects, 'foo');

		for (const object of objects) {
			expect(object.foo).toHaveBeenCalledTimes(1);
		}
	});

	it('should pass parameters to all methods', () => {
		const objects = [
			{ foo: jest.fn((num: number) => expect(num).toBe(1)) },
			{ foo: jest.fn((num: number) => expect(num).toBe(1)) },
			{ foo: jest.fn((num: number) => expect(num).toBe(1)) },
		];

		callAllOn(objects, 'foo', 1);
	});

	it('should call all methods when some fail', () => {
		const objects = [
			{ foo: jest.fn(() => {}) },
			{ foo: jest.fn(() => {}) },
			{ foo: jest.fn(() => {}) },
		];

		try {
			callAllOn(objects, 'foo');
		} catch {
			// ignore
		}

		for (const object of objects) {
			expect(object.foo).toHaveBeenCalledTimes(1);
		}
	});

	it('should throw when some methods fail', () => {
		const objects = [
			{ foo: jest.fn(() => { throw new Error(); }) },
			{ foo: jest.fn(() => {}) },
			{ foo: jest.fn(() => {}) },
		];

		expect(() => callAllOn(objects, 'foo')).toThrow();
	});

	it('should not throw when input is empty', () => {
		expect(() => callAllOn([] as { foo: () => void }[], 'foo')).not.toThrow();
	});
});

describe(callAllOnAsync, () => {
	it('should call all methods when all succeed', async () => {
		const objects = [
			{ foo: jest.fn(() => Promise.resolve()) },
			{ foo: jest.fn(() => Promise.resolve()) },
			{ foo: jest.fn(() => Promise.resolve()) },
		];

		await callAllOnAsync(objects, 'foo');

		for (const object of objects) {
			expect(object.foo).toHaveBeenCalledTimes(1);
		}
	});

	it('should pass parameters to all methods', async () => {
		const objects = [
			{ foo: jest.fn((num: number) => expect(num).toBe(1)) },
			{ foo: jest.fn((num: number) => expect(num).toBe(1)) },
			{ foo: jest.fn((num: number) => expect(num).toBe(1)) },
		];

		await callAllOnAsync(objects, 'foo', 1);
	});

	it('should call all methods when some fail', async () => {
		const objects = [
			{ foo: jest.fn(() => Promise.resolve()) },
			{ foo: jest.fn(() => Promise.resolve()) },
			{ foo: jest.fn(() => Promise.resolve()) },
		];

		try {
			await callAllOnAsync(objects, 'foo');
		} catch {
			// ignore
		}

		for (const object of objects) {
			expect(object.foo).toHaveBeenCalledTimes(1);
		}
	});

	it('should throw when some methods fail', async () => {
		const objects = [
			{ foo: jest.fn(() => Promise.reject(new Error())) },
			{ foo: jest.fn(() => Promise.resolve()) },
			{ foo: jest.fn(() => Promise.resolve()) },
		];

		await assert.throwsAsync(AggregateError, async () => {
			await callAllOnAsync(objects, 'foo');
		});
	});

	it('should not throw when input is empty', async () => {
		await callAllOnAsync([] as { foo: () => void }[], 'foo');
	});
});
