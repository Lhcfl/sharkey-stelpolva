/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type Redis from 'ioredis';
import type { MiUser } from '@/models/User.js';
import type { RolePolicies, RoleService } from '@/core/RoleService.js';
import { SkRateLimiterService } from '@/server/SkRateLimiterService.js';
import { BucketRateLimit, Keyed, LegacyRateLimit } from '@/misc/rate-limit-utils.js';

/* eslint-disable @typescript-eslint/no-non-null-assertion */

describe(SkRateLimiterService, () => {
	let mockTimeService: { now: number, date: Date } = null!;
	let mockRedis: Array<(command: [string, ...unknown[]]) => [Error | null, unknown] | null> = null!;
	let mockRedisExec: (batch: [string, ...unknown[]][]) => Promise<[Error | null, unknown][] | null> = null!;
	let mockEnvironment: Record<string, string | undefined> = null!;
	let serviceUnderTest: () => SkRateLimiterService = null!;
	let mockDefaultUserPolicies: Partial<RolePolicies> = null!;
	let mockUserPolicies: Record<string, Partial<RolePolicies>> = null!;

	beforeEach(() => {
		mockTimeService = {
			now: 0,
			get date() {
				return new Date(mockTimeService.now);
			},
		};

		function callMockRedis(command: [string, ...unknown[]]) {
			const handlerResults = mockRedis.map(handler => handler(command));
			const finalResult = handlerResults.findLast(result => result != null);
			return finalResult ?? [null, null];
		}

		// I apologize to anyone who tries to read this later 🥲
		mockRedis = [];
		mockRedisExec = (batch) => {
			const results: [Error | null, unknown][] = batch.map(command => {
				return callMockRedis(command);
			});
			return Promise.resolve(results);
		};
		const mockRedisClient = {
			watch(...args: unknown[]) {
				const result = callMockRedis(['watch', ...args]);
				return Promise.resolve(result[0] ?? result[1]);
			},
			get(...args: unknown[]) {
				const result = callMockRedis(['get', ...args]);
				return Promise.resolve(result[0] ?? result[1]);
			},
			set(...args: unknown[]) {
				const result = callMockRedis(['set', ...args]);
				return Promise.resolve(result[0] ?? result[1]);
			},
			multi(batch: [string, ...unknown[]][]) {
				return {
					exec() {
						return mockRedisExec(batch);
					},
				};
			},
			reset() {
				return Promise.resolve();
			},
		} as unknown as Redis.Redis;

		mockEnvironment = Object.create(process.env);
		mockEnvironment.NODE_ENV = 'production';
		const mockEnvService = {
			env: mockEnvironment,
		};

		mockDefaultUserPolicies = { rateLimitFactor: 1 };
		mockUserPolicies = {};
		const mockRoleService = {
			getUserPolicies(key: string | null) {
				const policies = key != null ? mockUserPolicies[key] : null;
				return Promise.resolve(policies ?? mockDefaultUserPolicies);
			},
		} as unknown as RoleService;

		let service: SkRateLimiterService | undefined = undefined;
		serviceUnderTest = () => {
			return service ??= new SkRateLimiterService(mockTimeService, mockRedisClient, mockRoleService, mockEnvService);
		};
	});

	describe('limit', () => {
		const actor = 'actor';
		const key = 'test';

		let limitCounter: number | undefined = undefined;
		let limitTimestamp: number | undefined = undefined;

		beforeEach(() => {
			limitCounter = undefined;
			limitTimestamp = undefined;

			mockRedis.push(([command, ...args]) => {
				if (command === 'get') {
					if (args[0] === 'rl_actor_test_c') {
						const data = limitCounter?.toString() ?? null;
						return [null, data];
					}
					if (args[0] === 'rl_actor_test_t') {
						const data = limitTimestamp?.toString() ?? null;
						return [null, data];
					}
				}

				if (command === 'set') {
					if (args[0] === 'rl_actor_test_c') {
						limitCounter = parseInt(args[1] as string);
						return [null, args[1]];
					}
					if (args[0] === 'rl_actor_test_t') {
						limitTimestamp = parseInt(args[1] as string);
						return [null, args[1]];
					}
				}

				if (command === 'incr') {
					if (args[0] === 'rl_actor_test_c') {
						limitCounter = (limitCounter ?? 0) + 1;
						return [null, null];
					}
					if (args[0] === 'rl_actor_test_t') {
						limitTimestamp = (limitTimestamp ?? 0) + 1;
						return [null, null];
					}
				}

				if (command === 'incrby') {
					if (args[0] === 'rl_actor_test_c') {
						limitCounter = (limitCounter ?? 0) + parseInt(args[1] as string);
						return [null, null];
					}
					if (args[0] === 'rl_actor_test_t') {
						limitTimestamp = (limitTimestamp ?? 0) + parseInt(args[1] as string);
						return [null, null];
					}
				}

				if (command === 'decr') {
					if (args[0] === 'rl_actor_test_c') {
						limitCounter = (limitCounter ?? 0) - 1;
						return [null, null];
					}
					if (args[0] === 'rl_actor_test_t') {
						limitTimestamp = (limitTimestamp ?? 0) - 1;
						return [null, null];
					}
				}

				if (command === 'decrby') {
					if (args[0] === 'rl_actor_test_c') {
						limitCounter = (limitCounter ?? 0) - parseInt(args[1] as string);
						return [null, null];
					}
					if (args[0] === 'rl_actor_test_t') {
						limitTimestamp = (limitTimestamp ?? 0) - parseInt(args[1] as string);
						return [null, null];
					}
				}

				return null;
			});
		});

		it('should bypass in test environment', async () => {
			mockEnvironment.NODE_ENV = 'test';

			const info = await serviceUnderTest().limit({ key: 'l', type: undefined, max: 0 }, actor);

			expect(info.blocked).toBeFalsy();
			expect(info.remaining).toBe(Number.MAX_SAFE_INTEGER);
			expect(info.resetSec).toBe(0);
			expect(info.resetMs).toBe(0);
			expect(info.fullResetSec).toBe(0);
			expect(info.fullResetMs).toBe(0);
		});

		describe('with bucket limit', () => {
			let limit: Keyed<BucketRateLimit> = null!;

			beforeEach(() => {
				limit = {
					type: 'bucket',
					key: 'test',
					size: 1,
				};
			});

			it('should allow when limit is not reached', async () => {
				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeFalsy();
			});

			it('should return correct info when allowed', async () => {
				limit.size = 2;
				limitCounter = 1;
				limitTimestamp = 0;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.remaining).toBe(0);
				expect(info.resetSec).toBe(1);
				expect(info.resetMs).toBe(1000);
				expect(info.fullResetSec).toBe(2);
				expect(info.fullResetMs).toBe(2000);
			});

			it('should increment counter when called', async () => {
				await serviceUnderTest().limit(limit, actor);

				expect(limitCounter).toBe(1);
			});

			it('should set timestamp when called', async () => {
				mockTimeService.now = 1000;

				await serviceUnderTest().limit(limit, actor);

				expect(limitTimestamp).toBe(1000);
			});

			it('should decrement counter when dripRate has passed', async () => {
				limitCounter = 2;
				limitTimestamp = 0;
				mockTimeService.now = 2000;

				await serviceUnderTest().limit(limit, actor);

				expect(limitCounter).toBe(1); // 2 (starting) - 2 (2x1 drip) + 1 (call) = 1
			});

			it('should decrement counter by dripSize', async () => {
				limitCounter = 2;
				limitTimestamp = 0;
				limit.dripSize = 2;
				mockTimeService.now = 1000;

				await serviceUnderTest().limit(limit, actor);

				expect(limitCounter).toBe(1); // 2 (starting) - 2 (1x2 drip) + 1 (call) = 1
			});

			it('should maintain counter between calls over time', async () => {
				limit.size = 5;

				await serviceUnderTest().limit(limit, actor); // 0 + 1 = 1
				mockTimeService.now += 1000; // 1 - 1 = 0
				await serviceUnderTest().limit(limit, actor); // 0 + 1 = 1
				await serviceUnderTest().limit(limit, actor); // 1 + 1 = 2
				await serviceUnderTest().limit(limit, actor); // 2 + 1 = 3
				mockTimeService.now += 1000; // 3 - 1 = 2
				mockTimeService.now += 1000; // 2 - 1 = 1
				await serviceUnderTest().limit(limit, actor); // 1 + 1 = 2

				expect(limitCounter).toBe(2);
				expect(limitTimestamp).toBe(3000);
			});

			it('should block when bucket is filled', async () => {
				limitCounter = 1;
				limitTimestamp = 0;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeTruthy();
			});

			it('should calculate correct info when blocked', async () => {
				limitCounter = 1;
				limitTimestamp = 0;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.resetSec).toBe(1);
				expect(info.resetMs).toBe(1000);
				expect(info.fullResetSec).toBe(1);
				expect(info.fullResetMs).toBe(1000);
			});

			it('should allow when bucket is filled but should drip', async () => {
				limitCounter = 1;
				limitTimestamp = 0;
				mockTimeService.now = 1000;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeFalsy();
			});

			it('should scale limit by factor', async () => {
				mockDefaultUserPolicies.rateLimitFactor = 0.5;
				limitCounter = 1;
				limitTimestamp = 0;

				const i1 = await serviceUnderTest().limit(limit, actor); // 1 + 1 = 2
				const i2 = await serviceUnderTest().limit(limit, actor); // 2 + 1 = 3
				mockTimeService.now += 500; // 3 - 1 = 2 (at 1/2 time)
				const i3 = await serviceUnderTest().limit(limit, actor);

				expect(i1.blocked).toBeFalsy();
				expect(i2.blocked).toBeTruthy();
				expect(i3.blocked).toBeFalsy();
			});

			it('should set counter expiration', async () => {
				const commands: unknown[][] = [];
				mockRedis.push(command => {
					commands.push(command);
					return null;
				});

				await serviceUnderTest().limit(limit, actor);

				expect(commands).toContainEqual(['expire', 'rl_actor_test_c', 1]);
			});

			it('should set timestamp expiration', async () => {
				const commands: unknown[][] = [];
				mockRedis.push(command => {
					commands.push(command);
					return null;
				});

				await serviceUnderTest().limit(limit, actor);

				expect(commands).toContainEqual(['expire', 'rl_actor_test_t', 1]);
			});

			it('should not increment when already blocked', async () => {
				limitCounter = 1;
				limitTimestamp = 0;
				mockTimeService.now += 100;

				await serviceUnderTest().limit(limit, actor);

				expect(limitCounter).toBe(1);
				expect(limitTimestamp).toBe(0);
			});

			it('should skip if factor is zero', async () => {
				mockDefaultUserPolicies.rateLimitFactor = 0;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeFalsy();
				expect(info.remaining).toBe(Number.MAX_SAFE_INTEGER);
			});

			it('should throw if factor is negative', async () => {
				mockDefaultUserPolicies.rateLimitFactor = -1;

				const promise = serviceUnderTest().limit(limit, actor);

				await expect(promise).rejects.toThrow(/factor is zero or negative/);
			});

			it('should throw if size is zero', async () => {
				limit.size = 0;

				const promise = serviceUnderTest().limit(limit, actor);

				await expect(promise).rejects.toThrow(/size is less than 1/);
			});

			it('should throw if size is negative', async () => {
				limit.size = -1;

				const promise = serviceUnderTest().limit(limit, actor);

				await expect(promise).rejects.toThrow(/size is less than 1/);
			});

			it('should throw if size is fraction', async () => {
				limit.size = 0.5;

				const promise = serviceUnderTest().limit(limit, actor);

				await expect(promise).rejects.toThrow(/size is less than 1/);
			});

			it('should throw if dripRate is zero', async () => {
				limit.dripRate = 0;

				const promise = serviceUnderTest().limit(limit, actor);

				await expect(promise).rejects.toThrow(/dripRate is less than 1/);
			});

			it('should throw if dripRate is negative', async () => {
				limit.dripRate = -1;

				const promise = serviceUnderTest().limit(limit, actor);

				await expect(promise).rejects.toThrow(/dripRate is less than 1/);
			});

			it('should throw if dripRate is fraction', async () => {
				limit.dripRate = 0.5;

				const promise = serviceUnderTest().limit(limit, actor);

				await expect(promise).rejects.toThrow(/dripRate is less than 1/);
			});

			it('should throw if dripSize is zero', async () => {
				limit.dripSize = 0;

				const promise = serviceUnderTest().limit(limit, actor);

				await expect(promise).rejects.toThrow(/dripSize is less than 1/);
			});

			it('should throw if dripSize is negative', async () => {
				limit.dripSize = -1;

				const promise = serviceUnderTest().limit(limit, actor);

				await expect(promise).rejects.toThrow(/dripSize is less than 1/);
			});

			it('should throw if dripSize is fraction', async () => {
				limit.dripSize = 0.5;

				const promise = serviceUnderTest().limit(limit, actor);

				await expect(promise).rejects.toThrow(/dripSize is less than 1/);
			});

			it('should apply correction if extra calls slip through', async () => {
				limitCounter = 2;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeTruthy();
				expect(info.remaining).toBe(0);
				expect(info.resetMs).toBe(2000);
				expect(info.resetSec).toBe(2);
				expect(info.fullResetMs).toBe(2000);
				expect(info.fullResetSec).toBe(2);
			});

			it('should look up factor by user ID', async () => {
				const userActor = { id: actor } as unknown as MiUser;
				mockUserPolicies[actor] = { rateLimitFactor: 0.5 };
				limitCounter = 1;
				limitTimestamp = 0;

				const i1 = await serviceUnderTest().limit(limit, userActor); // 1 + 1 = 2
				const i2 = await serviceUnderTest().limit(limit, userActor); // 2 + 1 = 3

				expect(i1.blocked).toBeFalsy();
				expect(i2.blocked).toBeTruthy();
			});
		});

		describe('with min interval', () => {
			let limit: Keyed<LegacyRateLimit> = null!;

			beforeEach(() => {
				limit = {
					type: undefined,
					key,
					minInterval: 1000,
				};
			});

			it('should allow when limit is not reached', async () => {
				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeFalsy();
			});

			it('should calculate correct info when allowed', async () => {
				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.remaining).toBe(0);
				expect(info.resetSec).toBe(1);
				expect(info.resetMs).toBe(1000);
				expect(info.fullResetSec).toBe(1);
				expect(info.fullResetMs).toBe(1000);
			});

			it('should increment counter when called', async () => {
				await serviceUnderTest().limit(limit, actor);

				expect(limitCounter).not.toBeUndefined();
				expect(limitCounter).toBe(1);
			});

			it('should set timestamp when called', async () => {
				mockTimeService.now = 1000;

				await serviceUnderTest().limit(limit, actor);

				expect(limitCounter).not.toBeUndefined();
				expect(limitTimestamp).toBe(1000);
			});

			it('should decrement counter when minInterval has passed', async () => {
				limitCounter = 1;
				limitTimestamp = 0;
				mockTimeService.now = 1000;

				await serviceUnderTest().limit(limit, actor);

				expect(limitCounter).not.toBeUndefined();
				expect(limitCounter).toBe(1); // 1 (starting) - 1 (interval) + 1 (call) = 1
			});

			it('should maintain counter between calls over time', async () => {
				await serviceUnderTest().limit(limit, actor); // 0 + 1 = 1
				mockTimeService.now += 1000; // 1 - 1 = 0
				await serviceUnderTest().limit(limit, actor); // 0 + 1 = 1
				await serviceUnderTest().limit(limit, actor); // blocked
				await serviceUnderTest().limit(limit, actor); // blocked
				mockTimeService.now += 1000; // 1 - 1 = 0
				mockTimeService.now += 1000; // 0 - 1 = 0
				const info = await serviceUnderTest().limit(limit, actor); // 0 + 1 = 1

				expect(info.blocked).toBeFalsy();
				expect(limitCounter).toBe(1);
				expect(limitTimestamp).toBe(3000);
			});

			it('should block when interval exceeded', async () => {
				limitCounter = 1;
				limitTimestamp = 0;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeTruthy();
			});

			it('should calculate correct info when blocked', async () => {
				limitCounter = 1;
				limitTimestamp = 0;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.resetSec).toBe(1);
				expect(info.resetMs).toBe(1000);
				expect(info.fullResetSec).toBe(1);
				expect(info.fullResetMs).toBe(1000);
			});

			it('should allow when bucket is filled but interval has passed', async () => {
				limitCounter = 1;
				limitTimestamp = 0;
				mockTimeService.now = 1000;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeFalsy();
			});

			it('should scale interval by factor', async () => {
				mockDefaultUserPolicies.rateLimitFactor = 0.5;
				limitCounter = 1;
				limitTimestamp = 0;

				const i1 = await serviceUnderTest().limit(limit, actor);
				const i2 = await serviceUnderTest().limit(limit, actor);
				mockTimeService.now += 500;
				const i3 = await serviceUnderTest().limit(limit, actor);

				expect(i1.blocked).toBeFalsy();
				expect(i2.blocked).toBeTruthy();
				expect(i3.blocked).toBeFalsy();
			});

			it('should set counter expiration', async () => {
				const commands: unknown[][] = [];
				mockRedis.push(command => {
					commands.push(command);
					return null;
				});

				await serviceUnderTest().limit(limit, actor);

				expect(commands).toContainEqual(['expire', 'rl_actor_test_c', 1]);
			});

			it('should set timer expiration', async () => {
				const commands: unknown[][] = [];
				mockRedis.push(command => {
					commands.push(command);
					return null;
				});

				await serviceUnderTest().limit(limit, actor);

				expect(commands).toContainEqual(['expire', 'rl_actor_test_t', 1]);
			});

			it('should not increment when already blocked', async () => {
				limitCounter = 1;
				limitTimestamp = 0;
				mockTimeService.now += 100;

				await serviceUnderTest().limit(limit, actor);

				expect(limitCounter).toBe(1);
				expect(limitTimestamp).toBe(0);
			});

			it('should skip if factor is zero', async () => {
				mockDefaultUserPolicies.rateLimitFactor = 0;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeFalsy();
				expect(info.remaining).toBe(Number.MAX_SAFE_INTEGER);
			});

			it('should throw if factor is negative', async () => {
				mockDefaultUserPolicies.rateLimitFactor = -1;

				const promise = serviceUnderTest().limit(limit, actor);

				await expect(promise).rejects.toThrow(/factor is zero or negative/);
			});

			it('should skip if minInterval is zero', async () => {
				limit.minInterval = 0;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeFalsy();
				expect(info.remaining).toBe(Number.MAX_SAFE_INTEGER);
			});

			it('should throw if minInterval is negative', async () => {
				limit.minInterval = -1;

				const promise = serviceUnderTest().limit(limit, actor);

				await expect(promise).rejects.toThrow(/minInterval is negative/);
			});

			it('should apply correction if extra calls slip through', async () => {
				limitCounter = 2;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeTruthy();
				expect(info.remaining).toBe(0);
				expect(info.resetMs).toBe(2000);
				expect(info.resetSec).toBe(2);
				expect(info.fullResetMs).toBe(2000);
				expect(info.fullResetSec).toBe(2);
			});
		});

		describe('with legacy limit', () => {
			let limit: Keyed<LegacyRateLimit> = null!;

			beforeEach(() => {
				limit = {
					type: undefined,
					key,
					max: 1,
					duration: 1000,
				};
			});

			it('should allow when limit is not reached', async () => {
				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeFalsy();
			});

			it('should infer dripRate from duration', async () => {
				limit.max = 10;
				limit.duration = 10000;
				limitCounter = 10;
				limitTimestamp = 0;

				const i1 = await serviceUnderTest().limit(limit, actor);
				mockTimeService.now += 1000;
				const i2 = await serviceUnderTest().limit(limit, actor);
				mockTimeService.now += 2000;
				const i3 = await serviceUnderTest().limit(limit, actor);
				const i4 = await serviceUnderTest().limit(limit, actor);
				const i5 = await serviceUnderTest().limit(limit, actor);
				mockTimeService.now += 2000;
				const i6 = await serviceUnderTest().limit(limit, actor);

				expect(i1.blocked).toBeTruthy();
				expect(i2.blocked).toBeFalsy();
				expect(i3.blocked).toBeFalsy();
				expect(i4.blocked).toBeFalsy();
				expect(i5.blocked).toBeTruthy();
				expect(i6.blocked).toBeFalsy();
			});

			it('should calculate correct info when allowed', async () => {
				limit.max = 10;
				limit.duration = 10000;
				limitCounter = 10;
				limitTimestamp = 0;
				mockTimeService.now += 2000;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.remaining).toBe(1);
				expect(info.resetSec).toBe(0);
				expect(info.resetMs).toBe(0);
				expect(info.fullResetSec).toBe(9);
				expect(info.fullResetMs).toBe(9000);
			});

			it('should calculate correct info when blocked', async () => {
				limit.max = 10;
				limit.duration = 10000;
				limitCounter = 10;
				limitTimestamp = 0;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.remaining).toBe(0);
				expect(info.resetSec).toBe(1);
				expect(info.resetMs).toBe(1000);
				expect(info.fullResetSec).toBe(10);
				expect(info.fullResetMs).toBe(10000);
			});

			it('should allow when bucket is filled but interval has passed', async () => {
				limitCounter = 10;
				limitTimestamp = 0;
				mockTimeService.now = 1000;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeTruthy();
			});

			it('should scale limit by factor', async () => {
				mockDefaultUserPolicies.rateLimitFactor = 0.5;
				limitCounter = 1;
				limitTimestamp = 0;

				const i1 = await serviceUnderTest().limit(limit, actor);
				const i2 = await serviceUnderTest().limit(limit, actor);
				mockTimeService.now += 500;
				const i3 = await serviceUnderTest().limit(limit, actor);

				expect(i1.blocked).toBeFalsy();
				expect(i2.blocked).toBeTruthy();
				expect(i3.blocked).toBeFalsy();
			});

			it('should set counter expiration', async () => {
				const commands: unknown[][] = [];
				mockRedis.push(command => {
					commands.push(command);
					return null;
				});

				await serviceUnderTest().limit(limit, actor);

				expect(commands).toContainEqual(['expire', 'rl_actor_test_c', 1]);
			});

			it('should set timestamp expiration', async () => {
				const commands: unknown[][] = [];
				mockRedis.push(command => {
					commands.push(command);
					return null;
				});

				await serviceUnderTest().limit(limit, actor);

				expect(commands).toContainEqual(['expire', 'rl_actor_test_t', 1]);
			});

			it('should not increment when already blocked', async () => {
				limitCounter = 1;
				limitTimestamp = 0;
				mockTimeService.now += 100;

				await serviceUnderTest().limit(limit, actor);

				expect(limitCounter).toBe(1);
				expect(limitTimestamp).toBe(0);
			});

			it('should not allow dripRate to be lower than 0', async () => {
				// real-world case; taken from StreamingApiServerService
				limit.max = 4096;
				limit.duration = 2000;
				limitCounter = 4096;
				limitTimestamp = 0;

				const i1 = await serviceUnderTest().limit(limit, actor);
				mockTimeService.now = 1;
				const i2 = await serviceUnderTest().limit(limit, actor);

				expect(i1.blocked).toBeTruthy();
				expect(i2.blocked).toBeFalsy();
			});

			it('should skip if factor is zero', async () => {
				mockDefaultUserPolicies.rateLimitFactor = 0;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeFalsy();
				expect(info.remaining).toBe(Number.MAX_SAFE_INTEGER);
			});

			it('should throw if factor is negative', async () => {
				mockDefaultUserPolicies.rateLimitFactor = -1;

				const promise = serviceUnderTest().limit(limit, actor);

				await expect(promise).rejects.toThrow(/factor is zero or negative/);
			});

			it('should skip if duration is zero', async () => {
				limit.duration = 0;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeFalsy();
				expect(info.remaining).toBe(Number.MAX_SAFE_INTEGER);
			});

			it('should throw if max is zero', async () => {
				limit.max = 0;

				const promise = serviceUnderTest().limit(limit, actor);

				await expect(promise).rejects.toThrow(/max is less than 1/);
			});

			it('should throw if max is negative', async () => {
				limit.max = -1;

				const promise = serviceUnderTest().limit(limit, actor);

				await expect(promise).rejects.toThrow(/max is less than 1/);
			});

			it('should apply correction if extra calls slip through', async () => {
				limitCounter = 2;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeTruthy();
				expect(info.remaining).toBe(0);
				expect(info.resetMs).toBe(2000);
				expect(info.resetSec).toBe(2);
				expect(info.fullResetMs).toBe(2000);
				expect(info.fullResetSec).toBe(2);
			});
		});

		describe('with legacy limit and min interval', () => {
			let limit: Keyed<LegacyRateLimit> = null!;

			beforeEach(() => {
				limit = {
					type: undefined,
					key,
					max: 10,
					duration: 5000,
					minInterval: 1000,
				};
			});

			it('should allow when limit is not reached', async () => {
				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeFalsy();
			});

			it('should block when limit exceeded', async () => {
				limitCounter = 10;
				limitTimestamp = 0;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeTruthy();
			});

			it('should calculate correct info when allowed', async () => {
				limitCounter = 9;
				limitTimestamp = 0;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.remaining).toBe(0);
				expect(info.resetSec).toBe(1);
				expect(info.resetMs).toBe(1000);
				expect(info.fullResetSec).toBe(5);
				expect(info.fullResetMs).toBe(5000);
			});

			it('should calculate correct info when blocked', async () => {
				limitCounter = 10;
				limitTimestamp = 0;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.remaining).toBe(0);
				expect(info.resetSec).toBe(1);
				expect(info.resetMs).toBe(1000);
				expect(info.fullResetSec).toBe(5);
				expect(info.fullResetMs).toBe(5000);
			});

			it('should allow when counter is filled but interval has passed', async () => {
				limitCounter = 5;
				limitTimestamp = 0;
				mockTimeService.now = 1000;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeFalsy();
			});

			it('should drip according to minInterval', async () => {
				limitCounter = 10;
				limitTimestamp = 0;
				mockTimeService.now += 1000;

				const i1 = await serviceUnderTest().limit(limit, actor);
				const i2 = await serviceUnderTest().limit(limit, actor);
				const i3 = await serviceUnderTest().limit(limit, actor);

				expect(i1.blocked).toBeFalsy();
				expect(i2.blocked).toBeFalsy();
				expect(i3.blocked).toBeTruthy();
			});

			it('should scale limit and interval by factor', async () => {
				mockDefaultUserPolicies.rateLimitFactor = 0.5;
				limitCounter = 19;
				limitTimestamp = 0;

				const i1 = await serviceUnderTest().limit(limit, actor);
				const i2 = await serviceUnderTest().limit(limit, actor);
				mockTimeService.now += 500;
				const i3 = await serviceUnderTest().limit(limit, actor);

				expect(i1.blocked).toBeFalsy();
				expect(i2.blocked).toBeTruthy();
				expect(i3.blocked).toBeFalsy();
			});

			it('should set counter expiration', async () => {
				const commands: unknown[][] = [];
				mockRedis.push(command => {
					commands.push(command);
					return null;
				});

				await serviceUnderTest().limit(limit, actor);

				expect(commands).toContainEqual(['expire', 'rl_actor_test_c', 5]);
			});

			it('should set timestamp expiration', async () => {
				const commands: unknown[][] = [];
				mockRedis.push(command => {
					commands.push(command);
					return null;
				});

				await serviceUnderTest().limit(limit, actor);

				expect(commands).toContainEqual(['expire', 'rl_actor_test_t', 5]);
			});

			it('should not increment when already blocked', async () => {
				limitCounter = 10;
				limitTimestamp = 0;
				mockTimeService.now += 100;

				await serviceUnderTest().limit(limit, actor);

				expect(limitCounter).toBe(10);
				expect(limitTimestamp).toBe(0);
			});

			it('should apply correction if extra calls slip through', async () => {
				limitCounter = 12;

				const info = await serviceUnderTest().limit(limit, actor);

				expect(info.blocked).toBeTruthy();
				expect(info.remaining).toBe(0);
				expect(info.resetMs).toBe(2000);
				expect(info.resetSec).toBe(2);
				expect(info.fullResetMs).toBe(6000);
				expect(info.fullResetSec).toBe(6);
			});
		});
	});
});
