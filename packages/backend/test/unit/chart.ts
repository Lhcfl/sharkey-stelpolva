/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MockConsole } from '../misc/MockConsole.js';

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { DataSource } from 'typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { GodOfTimeService } from '../misc/GodOfTimeService.js';
import { MockRedis } from '../misc/MockRedis.js';
import { GlobalModule } from '@/GlobalModule.js';
import TestChart from '@/core/chart/charts/test.js';
import TestGroupedChart from '@/core/chart/charts/test-grouped.js';
import TestUniqueChart from '@/core/chart/charts/test-unique.js';
import TestIntersectionChart from '@/core/chart/charts/test-intersection.js';
import { entity as TestChartEntity } from '@/core/chart/charts/entities/test.js';
import { entity as TestGroupedChartEntity } from '@/core/chart/charts/entities/test-grouped.js';
import { entity as TestUniqueChartEntity } from '@/core/chart/charts/entities/test-unique.js';
import { entity as TestIntersectionChartEntity } from '@/core/chart/charts/entities/test-intersection.js';
import { AppLockService } from '@/core/AppLockService.js';
import Logger from '@/logger.js';
import { CoreModule } from '@/core/CoreModule.js';
import { DI } from '@/di-symbols.js';
import { TimeService } from '@/global/TimeService.js';
import { LoggerService } from '@/core/LoggerService.js';

describe('Chart', () => {
	let app: TestingModule;
	let db: DataSource;
	let appLockService: AppLockService;
	let logger: Logger;
	let redis: MockRedis;

	let testChart: TestChart;
	let testGroupedChart: TestGroupedChart;
	let testUniqueChart: TestUniqueChart;
	let testIntersectionChart: TestIntersectionChart;
	let clock: GodOfTimeService;

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [GlobalModule, CoreModule],
		})
			.overrideProvider(DI.redis).useClass(MockRedis)
			.overrideProvider(TimeService).useClass(GodOfTimeService)
			.overrideProvider(DI.console).useClass(MockConsole)
			.compile();

		logger = app.get(LoggerService).getLogger('chart');
		appLockService = app.get(AppLockService);
		redis = app.get(DI.redis);
		db = app.get(DI.db);

		clock = app.get(TimeService);
		clock.resetTo(Date.UTC(2000, 0, 1, 0, 0, 0));

		await app.init();
		app.enableShutdownHooks();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(async () => {
		clock.resetTo(Date.UTC(2000, 0, 1, 0, 0, 0));
		redis.mockReset();

		testChart = new TestChart(db, appLockService, clock, logger);
		testGroupedChart = new TestGroupedChart(db, appLockService, clock, logger);
		testUniqueChart = new TestUniqueChart(db, appLockService, clock, logger);
		testIntersectionChart = new TestIntersectionChart(db, appLockService, clock, logger);
	});

	afterEach(async () => {
		const entities = [
			TestChartEntity.hour, TestChartEntity.day,
			TestGroupedChartEntity.hour, TestGroupedChartEntity.day,
			TestUniqueChartEntity.hour, TestUniqueChartEntity.day,
			TestIntersectionChartEntity.hour, TestIntersectionChartEntity.day,
		];

		for (const entity of entities) {
			await db.getRepository(entity).deleteAll();
		}
	});

	test('Can updates', async () => {
		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});
	});

	test('Can updates (dec)', async () => {
		await testChart.decrement();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [1, 0, 0],
				inc: [0, 0, 0],
				total: [-1, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [1, 0, 0],
				inc: [0, 0, 0],
				total: [-1, 0, 0],
			},
		});
	});

	test('Empty chart', async () => {
		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [0, 0, 0],
				total: [0, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [0, 0, 0],
				total: [0, 0, 0],
			},
		});
	});

	test('Can updates at multiple times at same time', async () => {
		await testChart.increment();
		await testChart.increment();
		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [3, 0, 0],
				total: [3, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [3, 0, 0],
				total: [3, 0, 0],
			},
		});
	});

	test('複数回saveされてもデータの更新は一度だけ', async () => {
		await testChart.increment();
		await testChart.save();
		await testChart.save();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});
	});

	test('Can updates at different times', async () => {
		await testChart.increment();
		await testChart.save();

		clock.tick({ hours: 1 });

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 1, 0],
				total: [2, 1, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	// 仕様上はこうなってほしいけど、実装は難しそうなのでskip
	/*
	test('Can updates at different times without save', async () => {
		await testChart.increment();

		clock.tick('01:00:00');

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 1, 0],
				total: [2, 1, 0]
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0]
			},
		});
	});
	*/

	test('Can padding', async () => {
		await testChart.increment();
		await testChart.save();

		clock.tick({ hours: 2 });

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 1],
				total: [2, 1, 1],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	// 要求された範囲にログがひとつもない場合でもパディングできる
	test('Can padding from past range', async () => {
		await testChart.increment();
		await testChart.save();

		clock.tick({ hours: 5 });

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [0, 0, 0],
				total: [1, 1, 1],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});
	});

	// 要求された範囲の最も古い箇所に位置するログが存在しない場合でもパディングできる
	// Issue #3190
	test('Can padding from past range 2', async () => {
		await testChart.increment();
		await testChart.save();

		clock.tick({ hours: 5 });

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, null);
		const chartDays = await testChart.getChart('day', 3, null);

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [2, 1, 1],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	test('Can specify offset', async () => {
		await testChart.increment();
		await testChart.save();

		clock.tick({ hours: 1 });

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)));
		const chartDays = await testChart.getChart('day', 3, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)));

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	test('Can specify offset (floor time)', async () => {
		clock.tick({ minutes: 30 });

		await testChart.increment();
		await testChart.save();

		clock.tick({ hours: 1, minutes: 30 });

		await testChart.increment();
		await testChart.save();

		const chartHours = await testChart.getChart('hour', 3, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)));
		const chartDays = await testChart.getChart('day', 3, new Date(Date.UTC(2000, 0, 1, 0, 0, 0)));

		assert.deepStrictEqual(chartHours, {
			foo: {
				dec: [0, 0, 0],
				inc: [1, 0, 0],
				total: [1, 0, 0],
			},
		});

		assert.deepStrictEqual(chartDays, {
			foo: {
				dec: [0, 0, 0],
				inc: [2, 0, 0],
				total: [2, 0, 0],
			},
		});
	});

	describe('Grouped', () => {
		test('Can updates', async () => {
			await testGroupedChart.increment('alice');
			await testGroupedChart.save();

			const aliceChartHours = await testGroupedChart.getChart('hour', 3, null, 'alice');
			const aliceChartDays = await testGroupedChart.getChart('day', 3, null, 'alice');
			const bobChartHours = await testGroupedChart.getChart('hour', 3, null, 'bob');
			const bobChartDays = await testGroupedChart.getChart('day', 3, null, 'bob');

			assert.deepStrictEqual(aliceChartHours, {
				foo: {
					dec: [0, 0, 0],
					inc: [1, 0, 0],
					total: [1, 0, 0],
				},
			});

			assert.deepStrictEqual(aliceChartDays, {
				foo: {
					dec: [0, 0, 0],
					inc: [1, 0, 0],
					total: [1, 0, 0],
				},
			});

			assert.deepStrictEqual(bobChartHours, {
				foo: {
					dec: [0, 0, 0],
					inc: [0, 0, 0],
					total: [0, 0, 0],
				},
			});

			assert.deepStrictEqual(bobChartDays, {
				foo: {
					dec: [0, 0, 0],
					inc: [0, 0, 0],
					total: [0, 0, 0],
				},
			});
		});
	});

	describe('Unique increment', () => {
		test('Can updates', async () => {
			await testUniqueChart.uniqueIncrement('alice');
			await testUniqueChart.uniqueIncrement('alice');
			await testUniqueChart.uniqueIncrement('bob');
			await testUniqueChart.save();

			const chartHours = await testUniqueChart.getChart('hour', 3, null);
			const chartDays = await testUniqueChart.getChart('day', 3, null);

			assert.deepStrictEqual(chartHours, {
				foo: [2, 0, 0],
			});

			assert.deepStrictEqual(chartDays, {
				foo: [2, 0, 0],
			});
		});

		describe('Intersection', () => {
			test('条件が満たされていない場合はカウントされない', async () => {
				await testIntersectionChart.addA('alice');
				await testIntersectionChart.addA('bob');
				await testIntersectionChart.addB('carol');
				await testIntersectionChart.save();

				const chartHours = await testIntersectionChart.getChart('hour', 3, null);
				const chartDays = await testIntersectionChart.getChart('day', 3, null);

				assert.deepStrictEqual(chartHours, {
					a: [2, 0, 0],
					b: [1, 0, 0],
					aAndB: [0, 0, 0],
				});

				assert.deepStrictEqual(chartDays, {
					a: [2, 0, 0],
					b: [1, 0, 0],
					aAndB: [0, 0, 0],
				});
			});

			test('条件が満たされている場合にカウントされる', async () => {
				await testIntersectionChart.addA('alice');
				await testIntersectionChart.addA('bob');
				await testIntersectionChart.addB('carol');
				await testIntersectionChart.addB('alice');
				await testIntersectionChart.save();

				const chartHours = await testIntersectionChart.getChart('hour', 3, null);
				const chartDays = await testIntersectionChart.getChart('day', 3, null);

				assert.deepStrictEqual(chartHours, {
					a: [2, 0, 0],
					b: [2, 0, 0],
					aAndB: [1, 0, 0],
				});

				assert.deepStrictEqual(chartDays, {
					a: [2, 0, 0],
					b: [2, 0, 0],
					aAndB: [1, 0, 0],
				});
			});
		});
	});

	describe('Resync', () => {
		test('Can resync', async () => {
			testChart.total = 1;

			await testChart.resync();

			const chartHours = await testChart.getChart('hour', 3, null);
			const chartDays = await testChart.getChart('day', 3, null);

			assert.deepStrictEqual(chartHours, {
				foo: {
					dec: [0, 0, 0],
					inc: [0, 0, 0],
					total: [1, 0, 0],
				},
			});

			assert.deepStrictEqual(chartDays, {
				foo: {
					dec: [0, 0, 0],
					inc: [0, 0, 0],
					total: [1, 0, 0],
				},
			});
		});

		test('Can resync (2)', async () => {
			await testChart.increment();
			await testChart.save();

			clock.tick({ hours: 1 });

			testChart.total = 100;

			await testChart.resync();

			const chartHours = await testChart.getChart('hour', 3, null);
			const chartDays = await testChart.getChart('day', 3, null);

			assert.deepStrictEqual(chartHours, {
				foo: {
					dec: [0, 0, 0],
					inc: [0, 1, 0],
					total: [100, 1, 0],
				},
			});

			assert.deepStrictEqual(chartDays, {
				foo: {
					dec: [0, 0, 0],
					inc: [1, 0, 0],
					total: [100, 0, 0],
				},
			});
		});
	});
});
