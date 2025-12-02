/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { AccessTokensRepository, AppsRepository, UsersRepository } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import { MemoryKVCache } from '@/misc/cache.js';
import type { MiApp } from '@/models/App.js';
import { CacheService } from '@/core/CacheService.js';
import { isNativeUserToken } from '@/misc/token.js';
import { bindThis } from '@/decorators.js';
import { attachCallerId } from '@/misc/attach-caller-id.js';
import { CacheManagementService, type ManagedMemoryKVCache } from '@/global/CacheManagementService.js';
import { TimeService } from '@/global/TimeService.js';
import { CollapsedQueueService } from '@/core/CollapsedQueueService.js';

export class AuthenticationError extends Error {
	// Fix the error name in stack traces - https://stackoverflow.com/a/71573071
	override name = this.constructor.name;

	constructor(message: string) {
		super(message);
		this.name = 'AuthenticationError';
	}
}

@Injectable()
export class AuthenticateService {
	private readonly appCache: ManagedMemoryKVCache<MiApp>;

	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.accessTokensRepository)
		private accessTokensRepository: AccessTokensRepository,

		@Inject(DI.appsRepository)
		private appsRepository: AppsRepository,

		private cacheService: CacheService,
		private readonly timeService: TimeService,
		private readonly collapsedQueueService: CollapsedQueueService,

		cacheManagementService: CacheManagementService,
	) {
		this.appCache = cacheManagementService.createMemoryKVCache<MiApp>('app', 1000 * 60 * 60 * 24); // 1d
	}

	@bindThis
	public async authenticate(token: string | null | undefined): Promise<[MiLocalUser | null, MiAccessToken | null]> {
		if (token == null) {
			return [null, null];
		}

		if (isNativeUserToken(token)) {
			const user = await this.cacheService.findOptionalLocalUserByNativeToken(token);

			if (user == null) {
				throw new AuthenticationError('user not found');
			}

			return [user, null];
		} else {
			const accessToken = await this.accessTokensRepository.findOne({
				where: [{
					hash: token.toLowerCase(), // app
				}, {
					token: token, // miauth
				}],
				relations: {
					user: true,
				},
			});

			if (accessToken == null) {
				throw new AuthenticationError('invalid signature');
			}

			await this.collapsedQueueService.updateAccessTokenQueue.enqueue(accessToken.id, {
				lastUsedAt: this.timeService.date,
			});

			// Loaded by relation above
			const user = accessToken.user as MiLocalUser;

			// Attach token to user - this will be read by RoleService to drop admin/moderator permissions.
			attachCallerId(user, { accessToken });

			if (accessToken.appId) {
				const app = await this.appCache.fetch(accessToken.appId,
					() => this.appsRepository.findOneByOrFail({ id: accessToken.appId! }));

				return [user, {
					id: accessToken.id,
					permission: app.permission,
					appId: app.id,
					app,
				} as MiAccessToken];
			} else {
				return [user, accessToken];
			}
		}
	}
}
