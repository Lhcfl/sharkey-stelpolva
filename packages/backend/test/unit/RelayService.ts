/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { Test } from '@nestjs/testing';
import { ModuleMocker } from 'jest-mock';
import { FakeQueueService } from '../misc/FakeQueueService.js';
import type { TestingModule } from '@nestjs/testing';
import type { MockMetadata } from 'jest-mock';
import type { Queues } from '@/queue/types.js';
import { QueueService } from '@/core/QueueService.js';
import { RelayService } from '@/core/RelayService.js';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';

const moduleMocker = new ModuleMocker(global);

describe('RelayService', () => {
	let app: TestingModule;
	let relayService: RelayService;
	let deliverQueue: Queues['deliver'];

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [
				GlobalModule,
				CoreModule,
			],
		})
			.useMocker((token) => {
				if (typeof token === 'function') {
					const mockMetadata = moduleMocker.getMetadata(token) as MockMetadata<any, any>;
					const Mock = moduleMocker.generateFromMetadata(mockMetadata);
					return new Mock();
				}
			})
			.overrideProvider(QueueService).useClass(FakeQueueService)
			.compile();

		await app.init();
		app.enableShutdownHooks();

		relayService = app.get<RelayService>(RelayService);
		deliverQueue = app.get<Queues['deliver']>('queue:deliver');

		await deliverQueue.drain(true);
	});

	afterAll(async () => {
		await app.close();
	});

	afterEach(async () => {
		await deliverQueue.drain(true);
	});

	test('addRelay', async () => {
		const result = await relayService.addRelay('https://example.com');

		expect(result.inbox).toBe('https://example.com');
		expect(result.status).toBe('requesting');

		const [job] = await deliverQueue.getJobs();
		expect(job).toBeDefined();
		expect(job.data.content).toContain('"type":"Follow"');
		expect(job.data.to).toBe('https://example.com');
	});

	test('listRelay', async () => {
		const result = await relayService.listRelay();

		expect(result.length).toBe(1);
		expect(result[0].inbox).toBe('https://example.com');
		expect(result[0].status).toBe('requesting');
	});

	test('removeRelay: succ', async () => {
		await relayService.removeRelay('https://example.com');

		const [job] = await deliverQueue.getJobs();
		expect(job).toBeDefined();
		expect(job.data.content).toContain('"type":"Undo"');
		expect(job.data.to).toBe('https://example.com');

		const list = await relayService.listRelay();
		expect(list.length).toBe(0);
	});

	test('removeRelay: fail', async () => {
		await expect(relayService.removeRelay('https://x.example.com'))
			.rejects.toThrow('relay not found');
	});
});
