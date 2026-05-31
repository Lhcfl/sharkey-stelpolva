/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Test, TestingModule } from '@nestjs/testing';
import { beforeAll, describe, jest } from '@jest/globals';
import { FakeQueueService } from '../misc/FakeQueueService.js';
import type { Queues } from '@/queue/types.js';
import { WebhookTestService } from '@/core/WebhookTestService.js';
import { UserWebhookPayload, UserWebhookService } from '@/core/UserWebhookService.js';
import { SystemWebhookPayload, SystemWebhookService } from '@/core/SystemWebhookService.js';
import { GlobalModule } from '@/GlobalModule.js';
import { MiSystemWebhook, MiUser, MiWebhook, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { DI } from '@/di-symbols.js';
import { QueueService } from '@/core/QueueService.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { CacheManagementService } from '@/global/CacheManagementService.js';
import { CoreModule } from '@/core/CoreModule.js';

describe('WebhookTestService', () => {
	let app: TestingModule;
	let service: WebhookTestService;

	// --------------------------------------------------------------------------------------

	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;
	let userWebhookDeliverQueue: Queues['userWebhookDeliver'];
	let systemWebhookDeliverQueue: Queues['systemWebhookDeliver'];
	let userWebhookService: jest.Mocked<UserWebhookService>;
	let systemWebhookService: jest.Mocked<SystemWebhookService>;
	let idService: IdService;
	let cacheManagementService: CacheManagementService;

	let root: MiUser;
	let alice: MiUser;

	async function createUser(data: Partial<MiUser> = {}) {
		const user = await usersRepository
			.insert({
				id: idService.gen(),
				...data,
			})
			.then(x => usersRepository.findOneByOrFail(x.identifiers[0]));

		await userProfilesRepository.insert({
			userId: user.id,
		});

		return user;
	}

	// --------------------------------------------------------------------------------------

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [
				GlobalModule,
				CoreModule,
			],
		})
			.overrideProvider(CustomEmojiService).useValue({
				populateEmojis: jest.fn(),
			})
			.overrideProvider(QueueService).useClass(FakeQueueService)
			.overrideProvider(UserWebhookService).useValue({
				fetchWebhooks: jest.fn(),
			})
			.overrideProvider(SystemWebhookService).useValue({
				fetchSystemWebhooks: jest.fn(),
			})
			.compile();

		await app.init();
		app.enableShutdownHooks();

		usersRepository = app.get(DI.usersRepository);
		userProfilesRepository = app.get(DI.userProfilesRepository);

		service = app.get(WebhookTestService);
		idService = app.get(IdService);
		cacheManagementService = app.get(CacheManagementService);
		userWebhookDeliverQueue = app.get<Queues['userWebhookDeliver']>('queue:userWebhookDeliver');
		systemWebhookDeliverQueue = app.get<Queues['systemWebhookDeliver']>('queue:systemWebhookDeliver');
		userWebhookService = app.get(UserWebhookService) as jest.Mocked<UserWebhookService>;
		systemWebhookService = app.get(SystemWebhookService) as jest.Mocked<SystemWebhookService>;

		await userWebhookDeliverQueue.drain(true);
		await systemWebhookDeliverQueue.drain(true);
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(async () => {
		root = await createUser({ username: 'root', usernameLower: 'root' });
		alice = await createUser({ username: 'alice', usernameLower: 'alice' });

		userWebhookService.fetchWebhooks.mockReturnValue(Promise.resolve([
			{ id: 'dummy-webhook', active: true, userId: alice.id } as MiWebhook,
		]));
		systemWebhookService.fetchSystemWebhooks.mockReturnValue(Promise.resolve([
			{ id: 'dummy-webhook', isActive: true } as MiSystemWebhook,
		]));
	});

	afterEach(async () => {
		await userWebhookDeliverQueue.drain(true);
		await systemWebhookDeliverQueue.drain(true);
		userWebhookService.fetchWebhooks.mockClear();
		systemWebhookService.fetchSystemWebhooks.mockClear();

		await userProfilesRepository.deleteAll();
		await usersRepository.deleteAll();
		await cacheManagementService.clear();
	});

	// --------------------------------------------------------------------------------------

	describe('testUserWebhook', () => {
		test('note', async () => {
			await service.testUserWebhook({ webhookId: 'dummy-webhook', type: 'note' }, alice);

			const [job] = await userWebhookDeliverQueue.getJobs();
			expect(job).toBeDefined();
			expect(job.data.webhookId).toBe('dummy-webhook');
			expect(job.data.type).toBe('note');
			expect((job.data.content as UserWebhookPayload<'note'>).note.id).toBe('dummy-note-1');
		});

		test('reply', async () => {
			await service.testUserWebhook({ webhookId: 'dummy-webhook', type: 'reply' }, alice);

			const [job] = await userWebhookDeliverQueue.getJobs();
			expect(job).toBeDefined();
			expect(job.data.webhookId).toBe('dummy-webhook');
			expect(job.data.type).toBe('reply');
			expect((job.data.content as UserWebhookPayload<'reply'>).note.id).toBe('dummy-reply-1');
		});

		test('renote', async () => {
			await service.testUserWebhook({ webhookId: 'dummy-webhook', type: 'renote' }, alice);

			const [job] = await userWebhookDeliverQueue.getJobs();
			expect(job).toBeDefined();
			expect(job.data.webhookId).toBe('dummy-webhook');
			expect(job.data.type).toBe('renote');
			expect((job.data.content as UserWebhookPayload<'renote'>).note.id).toBe('dummy-renote-1');
		});

		test('mention', async () => {
			await service.testUserWebhook({ webhookId: 'dummy-webhook', type: 'mention' }, alice);

			const [job] = await userWebhookDeliverQueue.getJobs();
			expect(job).toBeDefined();
			expect(job.data.webhookId).toBe('dummy-webhook');
			expect(job.data.type).toBe('mention');
			expect((job.data.content as UserWebhookPayload<'mention'>).note.id).toBe('dummy-mention-1');
		});

		test('follow', async () => {
			await service.testUserWebhook({ webhookId: 'dummy-webhook', type: 'follow' }, alice);

			const [job] = await userWebhookDeliverQueue.getJobs();
			expect(job).toBeDefined();
			expect(job.data.webhookId).toBe('dummy-webhook');
			expect(job.data.type).toBe('follow');
			expect((job.data.content as UserWebhookPayload<'follow'>).user.id).toBe('dummy-user-1');
		});

		test('followed', async () => {
			await service.testUserWebhook({ webhookId: 'dummy-webhook', type: 'followed' }, alice);

			const [job] = await userWebhookDeliverQueue.getJobs();
			expect(job).toBeDefined();
			expect(job.data.webhookId).toBe('dummy-webhook');
			expect(job.data.type).toBe('followed');
			expect((job.data.content as UserWebhookPayload<'followed'>).user.id).toBe('dummy-user-2');
		});

		test('unfollow', async () => {
			await service.testUserWebhook({ webhookId: 'dummy-webhook', type: 'unfollow' }, alice);

			const [job] = await userWebhookDeliverQueue.getJobs();
			expect(job).toBeDefined();
			expect(job.data.webhookId).toBe('dummy-webhook');
			expect(job.data.type).toBe('unfollow');
			expect((job.data.content as UserWebhookPayload<'unfollow'>).user.id).toBe('dummy-user-3');
		});

		describe('NoSuchWebhookError', () => {
			test('user not match', async () => {
				userWebhookService.fetchWebhooks.mockClear();
				userWebhookService.fetchWebhooks.mockReturnValue(Promise.resolve([
					{ id: 'dummy-webhook', active: true } as MiWebhook,
				]));

				await expect(service.testUserWebhook({ webhookId: 'dummy-webhook', type: 'note' }, root))
					.rejects.toThrow(WebhookTestService.NoSuchWebhookError);
			});
		});
	});

	describe('testSystemWebhook', () => {
		test('abuseReport', async () => {
			await service.testSystemWebhook({ webhookId: 'dummy-webhook', type: 'abuseReport' });

			const [job] = await systemWebhookDeliverQueue.getJobs();
			expect(job).toBeDefined();
			expect(job.data.webhookId).toBe('dummy-webhook');
			expect(job.data.type).toBe('abuseReport');
			expect((job.data.content as SystemWebhookPayload<'abuseReport'>).id).toBe('dummy-abuse-report1');
			expect((job.data.content as SystemWebhookPayload<'abuseReport'>).resolved).toBe(false);
		});

		test('abuseReportResolved', async () => {
			await service.testSystemWebhook({ webhookId: 'dummy-webhook', type: 'abuseReportResolved' });

			const [job] = await systemWebhookDeliverQueue.getJobs();
			expect(job).toBeDefined();
			expect(job.data.webhookId).toBe('dummy-webhook');
			expect(job.data.type).toBe('abuseReportResolved');
			expect((job.data.content as SystemWebhookPayload<'abuseReportResolved'>).id).toBe('dummy-abuse-report1');
			expect((job.data.content as SystemWebhookPayload<'abuseReportResolved'>).resolved).toBe(true);
		});

		test('userCreated', async () => {
			await service.testSystemWebhook({ webhookId: 'dummy-webhook', type: 'userCreated' });

			const [job] = await systemWebhookDeliverQueue.getJobs();
			expect(job).toBeDefined();
			expect(job.data.webhookId).toBe('dummy-webhook');
			expect(job.data.type).toBe('userCreated');
			expect((job.data.content as SystemWebhookPayload<'userCreated'>).id).toBe('dummy-user-1');
		});
	});
});
