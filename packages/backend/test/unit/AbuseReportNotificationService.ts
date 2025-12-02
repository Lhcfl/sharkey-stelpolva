/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { randomString } from '../utils.js';
import { AbuseReportNotificationService } from '@/core/AbuseReportNotificationService.js';
import {
	AbuseReportNotificationRecipientRepository,
	MiAbuseReportNotificationRecipient,
	MiAbuseUserReport,
	MiMeta,
	MiSystemWebhook,
	MiUser,
	SystemWebhooksRepository,
	UserProfilesRepository,
	UsersRepository,
} from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { GlobalModule } from '@/GlobalModule.js';
import { IdService } from '@/core/IdService.js';
import { EmailService } from '@/core/EmailService.js';
import { RoleService } from '@/core/RoleService.js';
import { MetaService } from '@/core/MetaService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { RecipientMethod } from '@/models/AbuseReportNotificationRecipient.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { CoreModule } from '@/core/CoreModule.js';

process.env.NODE_ENV = 'test';

describe('AbuseReportNotificationService', () => {
	let app: TestingModule;
	let service: AbuseReportNotificationService;

	// --------------------------------------------------------------------------------------

	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;
	let systemWebhooksRepository: SystemWebhooksRepository;
	let abuseReportNotificationRecipientRepository: AbuseReportNotificationRecipientRepository;
	let idService: IdService;
	let roleService: jest.Mocked<RoleService>;
	let emailService: jest.Mocked<EmailService>;
	let webhookService: jest.Mocked<SystemWebhookService>;

	// --------------------------------------------------------------------------------------

	let root: MiUser;
	let alice: MiUser;
	let bob: MiUser;
	let systemWebhook1: MiSystemWebhook;
	let systemWebhook2: MiSystemWebhook;

	// --------------------------------------------------------------------------------------

	const meta = {} as MiMeta;

	function updateMeta(newMeta: Partial<MiMeta>): void {
		for (const key in meta) {
			delete (meta as any)[key];
		}
		Object.assign(meta, newMeta);
	}

	async function createUser(data: Partial<MiUser> = {}) {
		const user = await usersRepository
			.insert({
				id: idService.gen(),
				...data,
			})
			.then(x => usersRepository.findOneByOrFail(x.identifiers[0]));

		await userProfilesRepository.insert({
			userId: user.id,
			email: user.username + '@example.com',
			emailVerified: true,
		});

		return user;
	}

	async function createWebhook(data: Partial<MiSystemWebhook> = {}) {
		return systemWebhooksRepository
			.insert({
				id: idService.gen(),
				name: randomString(),
				on: ['abuseReport'],
				url: 'https://example.com',
				secret: randomString(),
				...data,
			})
			.then(x => systemWebhooksRepository.findOneByOrFail(x.identifiers[0]));
	}

	async function createRecipient(data: Partial<MiAbuseReportNotificationRecipient> = {}) {
		return abuseReportNotificationRecipientRepository
			.insert({
				id: idService.gen(),
				isActive: true,
				name: randomString(),
				...data,
			})
			.then(x => abuseReportNotificationRecipientRepository.findOneByOrFail(x.identifiers[0]));
	}

	// --------------------------------------------------------------------------------------

	beforeAll(async () => {
		app = await Test
			.createTestingModule({
				imports: [
					GlobalModule,
					CoreModule,
				],
			})
			.overrideProvider(RoleService).useValue({ getModeratorIds: jest.fn() })
			.overrideProvider(SystemWebhookService).useValue({ enqueueSystemWebhook: jest.fn() })
			.overrideProvider(UserEntityService).useValue({
				pack: (v: any) => Promise.resolve(v),
				packMany: (v: any) => Promise.resolve(v),
			})
			.overrideProvider(EmailService).useValue({ sendEmail: jest.fn() })
			.overrideProvider(MetaService).useValue({ fetch: jest.fn() })
			.overrideProvider(ModerationLogService).useValue({ log: () => Promise.resolve() })
			.overrideProvider(GlobalEventService).useValue({ publishAdminStream: jest.fn() })
			.overrideProvider(DI.meta).useValue(meta)
			.compile();

		await app.init();
		app.enableShutdownHooks();

		usersRepository = app.get(DI.usersRepository);
		userProfilesRepository = app.get(DI.userProfilesRepository);
		systemWebhooksRepository = app.get(DI.systemWebhooksRepository);
		abuseReportNotificationRecipientRepository = app.get(DI.abuseReportNotificationRecipientRepository);

		service = app.get(AbuseReportNotificationService);
		idService = app.get(IdService);
		roleService = app.get(RoleService) as jest.Mocked<RoleService>;
		emailService = app.get<EmailService>(EmailService) as jest.Mocked<EmailService>;
		webhookService = app.get<SystemWebhookService>(SystemWebhookService) as jest.Mocked<SystemWebhookService>;
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(async () => {
		root = await createUser({ username: 'root', usernameLower: 'root' });
		alice = await createUser({ username: 'alice', usernameLower: 'alice' });
		bob = await createUser({ username: 'bob', usernameLower: 'bob' });
		systemWebhook1 = await createWebhook();
		systemWebhook2 = await createWebhook();

		roleService.getModeratorIds.mockResolvedValue([root.id, alice.id, bob.id]);

		updateMeta({} as MiMeta);
	});

	afterEach(async () => {
		emailService.sendEmail.mockClear();
		webhookService.enqueueSystemWebhook.mockClear();

		await usersRepository.deleteAll();
		await userProfilesRepository.deleteAll();
		await systemWebhooksRepository.deleteAll();
		await abuseReportNotificationRecipientRepository.deleteAll();
	});

	// --------------------------------------------------------------------------------------

	describe('createRecipient', () => {
		test('作成成功1', async () => {
			const params = {
				isActive: true,
				name: randomString(),
				method: 'email' as RecipientMethod,
				userId: alice.id,
				systemWebhookId: null,
			};

			const recipient1 = await service.createRecipient(params, root);
			expect(recipient1).toMatchObject(params);
		});

		test('作成成功2', async () => {
			const params = {
				isActive: true,
				name: randomString(),
				method: 'webhook' as RecipientMethod,
				userId: null,
				systemWebhookId: systemWebhook1.id,
			};

			const recipient1 = await service.createRecipient(params, root);
			expect(recipient1).toMatchObject(params);
		});
	});

	describe('updateRecipient', () => {
		test('更新成功1', async () => {
			const recipient1 = await createRecipient({
				method: 'email',
				userId: alice.id,
			});

			const params = {
				id: recipient1.id,
				isActive: false,
				name: randomString(),
				method: 'email' as RecipientMethod,
				userId: bob.id,
				systemWebhookId: null,
			};

			const recipient2 = await service.updateRecipient(params, root);
			expect(recipient2).toMatchObject(params);
		});

		test('更新成功2', async () => {
			const recipient1 = await createRecipient({
				method: 'webhook',
				systemWebhookId: systemWebhook1.id,
			});

			const params = {
				id: recipient1.id,
				isActive: false,
				name: randomString(),
				method: 'webhook' as RecipientMethod,
				userId: null,
				systemWebhookId: systemWebhook2.id,
			};

			const recipient2 = await service.updateRecipient(params, root);
			expect(recipient2).toMatchObject(params);
		});
	});

	describe('deleteRecipient', () => {
		test('削除成功1', async () => {
			const recipient1 = await createRecipient({
				method: 'email',
				userId: alice.id,
			});

			await service.deleteRecipient(recipient1.id, root);

			await expect(abuseReportNotificationRecipientRepository.findOneBy({ id: recipient1.id })).resolves.toBeNull();
		});
	});

	describe('fetchRecipients', () => {
		async function create() {
			const recipient1 = await createRecipient({
				method: 'email',
				userId: alice.id,
			});
			const recipient2 = await createRecipient({
				method: 'email',
				userId: bob.id,
			});

			const recipient3 = await createRecipient({
				method: 'webhook',
				systemWebhookId: systemWebhook1.id,
			});
			const recipient4 = await createRecipient({
				method: 'webhook',
				systemWebhookId: systemWebhook2.id,
			});

			return [recipient1, recipient2, recipient3, recipient4];
		}

		test('フィルタなし', async () => {
			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({});
			expect(recipients).toEqual([recipient1, recipient2, recipient3, recipient4]);
		});

		test('フィルタなし(非モデレータは除外される)', async () => {
			roleService.getModeratorIds.mockClear();
			roleService.getModeratorIds.mockResolvedValue([root.id, bob.id]);

			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({});
			// aliceはモデレータではないので除外される
			expect(recipients).toEqual([recipient2, recipient3, recipient4]);
		});

		test('フィルタなし(非モデレータでも除外されないオプション設定)', async () => {
			roleService.getModeratorIds.mockClear();
			roleService.getModeratorIds.mockResolvedValue([root.id, bob.id]);

			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({}, { removeUnauthorized: false });
			expect(recipients).toEqual([recipient1, recipient2, recipient3, recipient4]);
		});

		test('emailのみ', async () => {
			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({ method: ['email'] });
			expect(recipients).toEqual([recipient1, recipient2]);
		});

		test('webhookのみ', async () => {
			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({ method: ['webhook'] });
			expect(recipients).toEqual([recipient3, recipient4]);
		});

		test('すべて', async () => {
			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({ method: ['email', 'webhook'] });
			expect(recipients).toEqual([recipient1, recipient2, recipient3, recipient4]);
		});

		test('ID指定', async () => {
			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({ ids: [recipient1.id, recipient3.id] });
			expect(recipients).toEqual([recipient1, recipient3]);
		});

		test('ID指定(method=emailではないIDが混ざりこまない)', async () => {
			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({ ids: [recipient1.id, recipient3.id], method: ['email'] });
			expect(recipients).toEqual([recipient1]);
		});

		test('ID指定(method=webhookではないIDが混ざりこまない)', async () => {
			const [recipient1, recipient2, recipient3, recipient4] = await create();

			const recipients = await service.fetchRecipients({ ids: [recipient1.id, recipient3.id], method: ['webhook'] });
			expect(recipients).toEqual([recipient3]);
		});
	});

	describe('notifySystemWebhook', () => {
		test('非アクティブな通報通知はWebhook送信から除外される', async () => {
			const recipient1 = await createRecipient({
				method: 'webhook',
				systemWebhookId: systemWebhook1.id,
				isActive: true,
			});
			const recipient2 = await createRecipient({
				method: 'webhook',
				systemWebhookId: systemWebhook2.id,
				isActive: false,
			});

			const reports: MiAbuseUserReport[] = [
				{
					id: idService.gen(),
					targetUserId: alice.id,
					targetUser: alice,
					targetUserInstance: null,
					reporterId: bob.id,
					reporter: bob,
					reporterInstance: null,
					assigneeId: null,
					assignee: null,
					resolved: false,
					forwarded: false,
					comment: 'test',
					moderationNote: '',
					resolvedAs: null,
					targetUserHost: null,
					reporterHost: null,
				},
			];

			await service.notifySystemWebhook(reports, 'abuseReport');

			// 実際に除外されるかはSystemWebhookService側で確認する.
			// ここでは非アクティブな通報通知を除外設定できているかを確認する
			expect(webhookService.enqueueSystemWebhook).toHaveBeenCalledTimes(1);
			expect(webhookService.enqueueSystemWebhook.mock.calls[0][0]).toBe('abuseReport');
			expect(webhookService.enqueueSystemWebhook.mock.calls[0][2]).toEqual({ excludes: [systemWebhook2.id] });
		});
	});

	describe('collection of recipient-mails', () => {
		async function create() {
			const recipient = await createRecipient({
				method: 'email',
				userId: alice.id,
			});

			return recipient;
		}

		test('with nothing set', async () => {
			const mails = await service.getRecipientEMailAddresses();
			expect(mails).toEqual([]);
		});

		test('with maintainer mail set', async () => {
			updateMeta({ maintainerEmail: 'maintainer_mail' });
			const mails = await service.getRecipientEMailAddresses();
			expect(mails).toEqual(['maintainer_mail']);
		});

		test('with smtp mail set', async () => {
			updateMeta({ email: 'smtp_mail' });
			const mails = await service.getRecipientEMailAddresses();
			expect(mails).toEqual(['smtp_mail']);
		});

		test('with maintainer mail and smtp mail set', async () => {
			updateMeta({ email: 'smtp_mail', maintainerEmail: 'maintainer_mail' });
			const mails = await service.getRecipientEMailAddresses();
			expect(mails).toEqual(['smtp_mail', 'maintainer_mail']);
		});

		test('with recipients', async () => {
			await create();

			const mails = await service.getRecipientEMailAddresses();
			expect(mails).toEqual([
				'alice@example.com',
			]);
		});

		test('with recipients and maintainer mail set and smtp mail set', async () => {
			await create();
			updateMeta({ maintainerEmail: 'maintainer_mail', email: 'smtp_mail' });

			const mails = await service.getRecipientEMailAddresses();
			expect(mails).toEqual([
				'alice@example.com',
				'smtp_mail',
				'maintainer_mail',
			]);
		});
	});
});
