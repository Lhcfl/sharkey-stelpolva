/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { NotesRepository, UserPublickeysRepository, UsersRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import { MemoryKVCache } from '@/misc/cache.js';
import type { MiUserPublickey } from '@/models/UserPublickey.js';
import { CacheService } from '@/core/CacheService.js';
import { TimeService } from '@/global/TimeService.js';
import { UtilityService } from '@/core/UtilityService.js';
import type { MiNote } from '@/models/Note.js';
import { bindThis } from '@/decorators.js';
import type { MiLocalUser, MiRemoteUser } from '@/models/User.js';
import { ApLoggerService } from '@/core/activitypub/ApLoggerService.js';
import { IdService } from '@/core/IdService.js';
import { getApId } from './type.js';
import { ApPersonService } from './models/ApPersonService.js';
import type { IObject } from './type.js';

export type { UriParseResult } from '@/core/UtilityService.js';

@Injectable()
export class ApDbResolverService implements OnApplicationShutdown {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.userPublickeysRepository)
		private userPublickeysRepository: UserPublickeysRepository,

		private cacheService: CacheService,
		private apPersonService: ApPersonService,
		private apLoggerService: ApLoggerService,
		private utilityService: UtilityService,
		private readonly idService: IdService,
		private readonly timeService: TimeService,
	) {
		// Caches moved to ApPersonService to avoid circular dependency
	}

	// Moved to UtilityService to avoid circular dependency
	@bindThis
	public parseUri(value: string | IObject | [string | IObject]) {
		return this.utilityService.parseUri(value);
	}

	/**
	 * AP Note => Misskey Note in DB
	 */
	@bindThis
	public async getNoteFromApId(value: string | IObject | [string | IObject]): Promise<MiNote | null> {
		const parsed = this.parseUri(value);

		if (parsed.local) {
			if (parsed.type !== 'notes') return null;

			return await this.notesRepository.findOneBy({
				id: parsed.id,
			});
		} else {
			return await this.notesRepository.findOneBy({
				uri: parsed.uri,
			});
		}
	}

	/**
	 * AP Person => Misskey User in DB
	 */
	@bindThis
	public async getUserFromApId(value: string | IObject | [string | IObject]): Promise<MiLocalUser | MiRemoteUser | null> {
		const uri = getApId(value);
		return await this.apPersonService.fetchPerson(uri);
	}

	/**
	 * AP KeyId => Misskey User and Key
	 */
	@bindThis
	public async getAuthUserFromKeyId(keyId: string): Promise<{
		user: MiRemoteUser;
		key: MiUserPublickey;
	} | null> {
		const key = await this.apPersonService.findPublicKeyByKeyId(keyId);
		if (key == null) return null;

		const user = await this.cacheService.findOptionalRemoteUserById(key.userId);
		if (user == null) return null;
		if (user.isDeleted) return null;

		return {
			user,
			key,
		};
	}

	/**
	 * AP Actor id => Misskey User and Key
	 */
	@bindThis
	public async getAuthUserFromApId(uri: string): Promise<{
		user: MiRemoteUser;
		key: MiUserPublickey | null;
	} | null> {
		const user = await this.apPersonService.resolvePerson(uri) as MiRemoteUser;
		if (user.isDeleted) return null;

		const key = await this.apPersonService.findPublicKeyByUserId(user.id);

		return {
			user,
			key,
		};
	}

	/**
	 * Sharkey User -> Refetched Key
	 */
	@bindThis
	public async refetchPublicKeyForApId(user: MiRemoteUser): Promise<MiUserPublickey | null> {
		const oldKey = await this.apPersonService.findPublicKeyByUserId(user.id);

		// Don't re-fetch if we've updated the user recently
		const maxUpdatedTime = this.timeService.now - (1000 * 60 * 60); // 1 hour
		if ((user.lastFetchedAt && user.lastFetchedAt.valueOf() > maxUpdatedTime) ||
			(user.updatedAt && user.updatedAt.valueOf() > maxUpdatedTime) ||
			this.idService.parse(user.id).date.valueOf() > maxUpdatedTime
		) {
			this.apLoggerService.logger.debug(`Not updating public key for user ${user.id} (${user.uri}): already checked recently`);
			return oldKey;
		}

		this.apLoggerService.logger.debug(`Updating public key for user ${user.id} (${user.uri})`);

		// updatePerson will update the public key cache if there's any changes.
		await this.apPersonService.updatePerson(user.uri);
		const newKey = await this.apPersonService.findPublicKeyByUserId(user.id);

		if (newKey && oldKey) {
			if (newKey.keyPem === oldKey.keyPem) {
				this.apLoggerService.logger.debug(`Public key is up-to-date for user ${user.id} (${user.uri})`);
			} else {
				this.apLoggerService.logger.info(`Updated public key for user ${user.id} (${user.uri})`);
			}
		} else if (newKey) {
			this.apLoggerService.logger.info(`Registered public key for user ${user.id} (${user.uri})`);
		} else if (oldKey) {
			this.apLoggerService.logger.info(`Deleted public key for user ${user.id} (${user.uri})`);
		} else {
			this.apLoggerService.logger.warn(`Could not find any public key for user ${user.id} (${user.uri})`);
		}

		return newKey ?? oldKey;
	}

	@bindThis
	public dispose(): void {
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
