/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { IsNull, Not } from 'typeorm';
import { FakeCacheManagementService } from '../misc/FakeCacheManagementService.js';
import type { TestingModule } from '@nestjs/testing';
import { GlobalModule } from '@/GlobalModule.js';
import { DI } from '@/di-symbols.js';
import { MetaService } from '@/core/MetaService.js';
import { CoreModule } from '@/core/CoreModule.js';
import { InstancesRepository, MetasRepository, MiMeta } from '@/models/_.js';
import { InternalEventService, InternalEventTypes } from '@/global/InternalEventService.js';
import { CacheManagementService } from '@/global/CacheManagementService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { FeaturedService } from '@/core/FeaturedService.js';

describe('MetaService', () => {
	let app: TestingModule;
	let meta: MiMeta;
	let metaService: MetaService;
	let metasRepository: MetasRepository;
	let instancesRepository: InstancesRepository;
	let federatedInstanceService: FederatedInstanceService;
	let internalEventService: InternalEventService;
	let cacheManagementService: FakeCacheManagementService;
	let featuredService: FeaturedService & { removeHashtagsFromRanking: ReturnType<typeof jest.fn<FeaturedService['removeHashtagsFromRanking']>> };

	beforeAll(async () => {
		app = await Test
			.createTestingModule({
				imports: [
					GlobalModule,
					CoreModule,
				],
			})
			.overrideProvider(CacheManagementService).useClass(FakeCacheManagementService)
			.compile();

		await app.init();
		app.enableShutdownHooks();

		meta = app.get<MiMeta>(DI.meta);
		metaService = app.get<MetaService>(MetaService, { strict: false });
		metasRepository = app.get<MetasRepository>(DI.metasRepository);
		instancesRepository = app.get<InstancesRepository>(DI.instancesRepository);
		federatedInstanceService = app.get<FederatedInstanceService>(FederatedInstanceService);
		internalEventService = app.get<InternalEventService>(InternalEventService);
		cacheManagementService = app.get<FakeCacheManagementService>(CacheManagementService);

		featuredService = app.get<FeaturedService>(FeaturedService) as typeof featuredService;
		Object.defineProperty(featuredService, 'removeHashtagsFromRanking', {
			value: jest.fn(() => Promise.resolve()),
			writable: true,
			configurable: true,
		});
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(async () => {
		const delta = {
			name: 'initial name',
			blockedHosts: [],
			silencedHosts: [],
			mediaSilencedHosts: [],
			federationHosts: [],
			bubbleInstances: [],
			hiddenTags: [],
		};
		Object.assign(meta, delta);
		await metasRepository.updateAll(delta);
	});

	afterEach(async () => {
		await cacheManagementService.clear();
		await instancesRepository.deleteAll();
		featuredService.removeHashtagsFromRanking.mockReset();
	});

	describe('update', () => {
		it('should update database', async () => {
			await metaService.update({ name: 'updated name' });

			const result = await metasRepository.findOneOrFail({ where: { id: Not(IsNull()) }, order: { id: 'DESC' } });

			expect(result.name).toBe('updated name');
		});
	});

	it('should sync to other processes', async () => {
		let message: InternalEventTypes['metaUpdated'] | undefined = undefined;
		internalEventService.once('metaUpdated', (body: InternalEventTypes['metaUpdated']) => {
			message = body;
		});

		await metaService.update({ name: 'updated name' });

		expect(message).toBeDefined();
		expect(message!.before.name).toBe('initial name');
		expect(message!.after.name).toBe('updated name');
	});

	it('should persist blockedHosts', async () => {
		await federatedInstanceService.federatedInstanceCache.fetch('1.example.com');

		await metaService.update({ blockedHosts: ['example.com'] });

		const instance = await federatedInstanceService.federatedInstanceCache.refresh('1.example.com');
		expect(instance.isBlocked).toBe(true);
	});

	it('should persist silencedHosts', async () => {
		await federatedInstanceService.federatedInstanceCache.fetch('1.example.com');

		await metaService.update({ silencedHosts: ['example.com'] });

		const instance = await federatedInstanceService.federatedInstanceCache.refresh('1.example.com');
		expect(instance.isSilenced).toBe(true);
	});

	it('should persist mediaSilencedHosts', async () => {
		await federatedInstanceService.federatedInstanceCache.fetch('1.example.com');

		await metaService.update({ mediaSilencedHosts: ['example.com'] });

		const instance = await federatedInstanceService.federatedInstanceCache.refresh('1.example.com');
		expect(instance.isMediaSilenced).toBe(true);
	});

	it('should persist federationHosts', async () => {
		await federatedInstanceService.federatedInstanceCache.fetch('1.example.com');

		await metaService.update({ federationHosts: ['example.com'] });

		const instance = await federatedInstanceService.federatedInstanceCache.refresh('1.example.com');
		expect(instance.isAllowListed).toBe(true);
	});

	it('should persist bubbleInstances', async () => {
		await federatedInstanceService.federatedInstanceCache.fetch('1.example.com');

		await metaService.update({ bubbleInstances: ['example.com'] });

		const instance = await federatedInstanceService.federatedInstanceCache.refresh('1.example.com');
		expect(instance.isBubbled).toBe(true);
	});

	it('should persist hiddenTags', async () => {
		await metaService.update({ hiddenTags: ['filteredTag'] });

		expect(featuredService.removeHashtagsFromRanking).toHaveBeenCalledWith(['filteredTag']);
	});
});
