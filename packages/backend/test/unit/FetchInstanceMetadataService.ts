/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { GodOfTimeService } from '../misc/GodOfTimeService.js';
import { MockRedis } from '../misc/MockRedis.js';
import type { TestingModule } from '@nestjs/testing';
import type { InstancesRepository } from '@/models/_.js';
import { GlobalModule } from '@/GlobalModule.js';
import { FetchInstanceMetadataService } from '@/core/FetchInstanceMetadataService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { IdService } from '@/core/IdService.js';
import { CacheManagementService } from '@/global/CacheManagementService.js';
import { CoreModule } from '@/core/CoreModule.js';
import { DI } from '@/di-symbols.js';
import { TimeService } from '@/global/TimeService.js';

describe('FetchInstanceMetadataService', () => {
	let app: TestingModule;
	let fetchInstanceMetadataService: FetchInstanceMetadataService;
	let federatedInstanceService: jest.Mocked<FederatedInstanceService>;
	let httpRequestService: jest.Mocked<HttpRequestService>;
	let redisClient: MockRedis;
	let instancesRepository: InstancesRepository;
	let cacheManagementService: CacheManagementService;
	let timeService: GodOfTimeService;

	beforeAll(async () => {
		app = await Test
			.createTestingModule({
				imports: [
					GlobalModule,
					CoreModule,
				],
			})
			.overrideProvider(TimeService).useClass(GodOfTimeService)
			.overrideProvider(HttpRequestService).useValue({ getJson: jest.fn(), getHtml: jest.fn(), send: jest.fn() })
			.overrideProvider(FederatedInstanceService).useValue({ fetchOrRegister: jest.fn() })
			.overrideProvider(DI.redis).useClass(MockRedis)
			.overrideProvider(DI.redisForSub).useClass(MockRedis)
			.overrideProvider(DI.redisForPub).useClass(MockRedis)
			.compile();

		await app.init();
		app.enableShutdownHooks();

		fetchInstanceMetadataService = app.get<FetchInstanceMetadataService>(FetchInstanceMetadataService);
		federatedInstanceService = app.get<FederatedInstanceService>(FederatedInstanceService) as jest.Mocked<FederatedInstanceService>;
		httpRequestService = app.get<HttpRequestService>(HttpRequestService) as jest.Mocked<HttpRequestService>;
		instancesRepository = app.get<InstancesRepository>(DI.instancesRepository);
		cacheManagementService = app.get(CacheManagementService);
		timeService = app.get(TimeService);
		redisClient = app.get(DI.redis);
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		federatedInstanceService.fetchOrRegister.mockReset();
		httpRequestService.getJson.mockReset();
		httpRequestService.getHtml.mockReset();
		httpRequestService.send.mockReset();
		redisClient.mockReset();
		timeService.resetToNow();
	});

	afterEach(async () => {
		await instancesRepository.deleteAll();
		cacheManagementService.clear();
	});

	test('Lock and update', async () => {
		const now = timeService.now;
		federatedInstanceService.fetchOrRegister.mockResolvedValue({ infoUpdatedAt: { getTime: () => { return now - 10 * 1000 * 60 * 60 * 24; } } } as any);
		httpRequestService.getJson.mockImplementation(() => { throw Error(); });
		const tryLockSpy = jest.spyOn(fetchInstanceMetadataService, 'tryLock');
		const unlockSpy = jest.spyOn(fetchInstanceMetadataService, 'unlock');

		await fetchInstanceMetadataService.fetchInstanceMetadata({ host: 'example.com' } as any);
		expect(tryLockSpy).toHaveBeenCalledTimes(1);
		expect(unlockSpy).toHaveBeenCalledTimes(1);
		expect(federatedInstanceService.fetchOrRegister).toHaveBeenCalledTimes(1);
		expect(httpRequestService.getJson).toHaveBeenCalled();
	});

	test('Lock and don\'t update', async () => {
		const now = timeService.now;
		federatedInstanceService.fetchOrRegister.mockResolvedValue({ infoUpdatedAt: { getTime: () => now } } as any);
		httpRequestService.getJson.mockImplementation(() => { throw Error(); });
		const tryLockSpy = jest.spyOn(fetchInstanceMetadataService, 'tryLock');
		const unlockSpy = jest.spyOn(fetchInstanceMetadataService, 'unlock');

		await fetchInstanceMetadataService.fetchInstanceMetadata({ host: 'example.com' } as any);
		expect(tryLockSpy).toHaveBeenCalledTimes(1);
		expect(unlockSpy).toHaveBeenCalledTimes(1);
		expect(federatedInstanceService.fetchOrRegister).toHaveBeenCalledTimes(1);
		expect(httpRequestService.getJson).toHaveBeenCalledTimes(0);
	});

	test('Do nothing when lock not acquired', async () => {
		const now = timeService.now;
		federatedInstanceService.fetchOrRegister.mockResolvedValue({ infoUpdatedAt: { getTime: () => now - 10 * 1000 * 60 * 60 * 24 } } as any);
		httpRequestService.getJson.mockImplementation(() => { throw Error(); });
		await fetchInstanceMetadataService.tryLock('example.com');
		const tryLockSpy = jest.spyOn(fetchInstanceMetadataService, 'tryLock');
		const unlockSpy = jest.spyOn(fetchInstanceMetadataService, 'unlock');

		await fetchInstanceMetadataService.fetchInstanceMetadata({ host: 'example.com' } as any);
		expect(tryLockSpy).toHaveBeenCalledTimes(1);
		expect(unlockSpy).toHaveBeenCalledTimes(0);
		expect(federatedInstanceService.fetchOrRegister).toHaveBeenCalledTimes(0);
		expect(httpRequestService.getJson).toHaveBeenCalledTimes(0);
	});

	test('Do when lock not acquired but forced', async () => {
		const now = timeService.now;
		federatedInstanceService.fetchOrRegister.mockResolvedValue({ infoUpdatedAt: { getTime: () => now - 10 * 1000 * 60 * 60 * 24 } } as any);
		httpRequestService.getJson.mockImplementation(() => { throw Error(); });
		await fetchInstanceMetadataService.tryLock('example.com');
		const tryLockSpy = jest.spyOn(fetchInstanceMetadataService, 'tryLock');
		const unlockSpy = jest.spyOn(fetchInstanceMetadataService, 'unlock');

		await fetchInstanceMetadataService.fetchInstanceMetadata({ host: 'example.com' } as any, true);
		expect(tryLockSpy).toHaveBeenCalledTimes(0);
		expect(unlockSpy).toHaveBeenCalledTimes(1);
		expect(federatedInstanceService.fetchOrRegister).toHaveBeenCalledTimes(0);
		expect(httpRequestService.getJson).toHaveBeenCalled();
	});
});
