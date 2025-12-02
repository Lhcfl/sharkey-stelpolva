/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import * as Redis from 'ioredis';
import bcrypt from 'bcryptjs';
import { MiLocalUser, MiUser } from '@/models/User.js';
import { MiSystemAccount, MiUsedUsername, MiUserKeypair, MiUserProfile, type UsersRepository, type SystemAccountsRepository } from '@/models/_.js';
import type { MiMeta, UserProfilesRepository } from '@/models/_.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { MemoryKVCache } from '@/misc/cache.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { generateNativeUserToken } from '@/misc/token.js';
import { IdService } from '@/core/IdService.js';
import { genRsaKeyPair } from '@/misc/gen-key-pair.js';
import { CacheManagementService, type ManagedMemoryKVCache } from '@/global/CacheManagementService.js';
import { CacheService } from '@/core/CacheService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { TimeService } from '@/global/TimeService.js';

export const SYSTEM_ACCOUNT_TYPES = ['actor', 'relay', 'proxy'] as const;

@Injectable()
export class SystemAccountService implements OnApplicationShutdown {
	private readonly cache: ManagedMemoryKVCache<string>;

	constructor(
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.systemAccountsRepository)
		private systemAccountsRepository: SystemAccountsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private idService: IdService,
		private readonly cacheService: CacheService,
		private readonly internalEventService: InternalEventService,
		private readonly timeService: TimeService,

		cacheManagementService: CacheManagementService,
	) {
		this.cache = cacheManagementService.createMemoryKVCache<string>('systemAccount', 1000 * 60 * 10); // 10m

		this.redisForSub.on('message', this.onMessage);
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'metaUpdated': {
					if (body.before != null && body.before.name !== body.after.name) {
						for (const account of SYSTEM_ACCOUNT_TYPES) {
							await this.updateCorrespondingUserProfile(account, {
								name: body.after.name,
							});
						}
					}
					break;
				}
				default:
					break;
			}
		}
	}

	@bindThis
	public async list(): Promise<MiSystemAccount[]> {
		const accounts = await this.systemAccountsRepository.findBy({});

		return accounts;
	}

	@bindThis
	public async fetch(type: typeof SYSTEM_ACCOUNT_TYPES[number]): Promise<MiLocalUser> {
		// Use local cache to find userId for type
		const userId = await this.cache.fetch(type, async () => {
			const systemAccount = await this.systemAccountsRepository.findOne({
				where: { type: type },
				select: { userId: true },
			}) as { userId: string } | null;

			if (systemAccount) {
				return systemAccount.userId;
			} else {
				const created = await this.createCorrespondingUser(type, {
					username: `system.${type}`, // NOTE: (できれば避けたいが) . が含まれるかどうかでシステムアカウントかどうかを判定している処理もあるので変えないように
					name: this.meta.name,
				});
				return created.id;
			}
		});

		// Get the actual user entity from shared caches.
		return await this.cacheService.findLocalUserById(userId);
	}

	@bindThis
	private async createCorrespondingUser(type: typeof SYSTEM_ACCOUNT_TYPES[number], extra: {
		username: MiUser['username'];
		name?: MiUser['name'];
	}): Promise<MiLocalUser> {
		const password = randomUUID();

		// Generate hash of password
		const salt = await bcrypt.genSalt(8);
		const hash = await bcrypt.hash(password, salt);

		// Generate secret
		const secret = generateNativeUserToken();

		const keyPair = await genRsaKeyPair();

		let account!: MiUser;

		// Start transaction
		await this.db.transaction(async transactionalEntityManager => {
			const exist = await transactionalEntityManager.findOneBy(MiUser, {
				usernameLower: extra.username.toLowerCase(),
				host: IsNull(),
			});

			if (exist) {
				account = exist;
				return;
			}

			account = await transactionalEntityManager.insert(MiUser, {
				id: this.idService.gen(),
				username: extra.username,
				usernameLower: extra.username.toLowerCase(),
				host: null,
				token: secret,
				isLocked: true,
				isExplorable: false,
				isBot: true,
				name: extra.name,
				// System accounts are automatically approved.
				approved: true,
				// We always allow requests to system accounts to avoid federation infinite loop.
				// When a remote instance needs to check our signature on a request we sent, it will need to fetch information about the user that signed it (which is our instance actor).
				// If we try to check their signature on *that* request, we'll fetch *their* instance actor... leading to an infinite recursion
				allowUnsignedFetch: 'always',
			}).then(x => transactionalEntityManager.findOneByOrFail(MiUser, x.identifiers[0]));

			await transactionalEntityManager.insert(MiUserKeypair, {
				publicKey: keyPair.publicKey,
				privateKey: keyPair.privateKey,
				userId: account.id,
			});

			await transactionalEntityManager.insert(MiUserProfile, {
				userId: account.id,
				autoAcceptFollowed: false,
				password: hash,
			});

			await transactionalEntityManager.insert(MiUsedUsername, {
				createdAt: this.timeService.date,
				username: extra.username.toLowerCase(),
			});

			await transactionalEntityManager.insert(MiSystemAccount, {
				id: this.idService.gen(),
				userId: account.id,
				type: type,
			});
		});

		return account as MiLocalUser;
	}

	@bindThis
	public async updateCorrespondingUserProfile(type: typeof SYSTEM_ACCOUNT_TYPES[number], extra: {
		name?: string | null;
		description?: MiUserProfile['description'];
	}): Promise<MiLocalUser> {
		const user = await this.fetch(type);

		const updates = {} as Partial<MiUser>;
		if (extra.name !== undefined) updates.name = extra.name;

		if (Object.keys(updates).length > 0) {
			await this.usersRepository.update(user.id, updates);
			await this.internalEventService.emit('localUserUpdated', { id: user.id });
		}

		const profileUpdates = {} as Partial<MiUserProfile>;
		if (extra.description !== undefined) profileUpdates.description = extra.description;

		if (Object.keys(profileUpdates).length > 0) {
			await this.userProfilesRepository.update(user.id, profileUpdates);
			await this.internalEventService.emit('updateUserProfile', { userId: user.id });
		}

		return await this.cacheService.findLocalUserById(user.id);
	}

	public async getInstanceActor() {
		return await this.fetch('actor');
	}

	public async getRelayActor() {
		return await this.fetch('relay');
	}

	public async getProxyActor() {
		return await this.fetch('proxy');
	}

	@bindThis
	public dispose(): void {
		this.redisForSub.off('message', this.onMessage);
	}

	@bindThis
	public onApplicationShutdown(signal?: string): void {
		this.dispose();
	}
}
