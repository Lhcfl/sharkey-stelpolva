/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import chalk from 'chalk';
import { IsNull } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { UsersRepository } from '@/models/_.js';
import type { MiUser, MiLocalUser, MiRemoteUser } from '@/models/User.js';
import type { Config } from '@/config.js';
import type Logger from '@/logger.js';
import { UtilityService } from '@/core/UtilityService.js';
import { ILink, WebfingerService } from '@/core/WebfingerService.js';
import { RemoteLoggerService } from '@/core/RemoteLoggerService.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import { TimeService } from '@/global/TimeService.js';
import { CacheService } from '@/core/CacheService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import * as Acct from '@/misc/acct.js';
import { isRemoteUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';
import { renderInlineError } from '@/misc/render-inline-error.js';

@Injectable()
export class RemoteUserResolveService {
	private logger: Logger;
	private readonly selfHost: string;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private utilityService: UtilityService,
		private webfingerService: WebfingerService,
		private remoteLoggerService: RemoteLoggerService,
		private apDbResolverService: ApDbResolverService,
		private apPersonService: ApPersonService,
		private readonly cacheService: CacheService,
		private readonly internalEventService: InternalEventService,
		private readonly timeService: TimeService,
	) {
		this.logger = this.remoteLoggerService.logger.createSubLogger('resolve-user');
		this.selfHost = this.utilityService.toPuny(this.config.host);
	}

	@bindThis
	public async resolveUser(username: string, host: string | null): Promise<MiLocalUser | MiRemoteUser> {
		// Normalize inputs
		username = username.toLowerCase();
		host = host ? this.utilityService.toPuny(host) : null; // unicode -> punycode
		host = host !== this.selfHost ? host : null; // self-host -> null
		const acct = Acct.toString({ username, host }); // username+host -> acct (handle)

		// Try fetch from DB
		let user: MiUser | null | undefined = await this.cacheService.findOptionalUserByAcct(acct);

		// Opportunistically update remote users
		if (user != null && isRemoteUser(user)) {
			user = await this.tryUpdateUser(user, acct);
		}

		// Try resolve from AP
		if (user == null && host != null) {
			user = await this.tryCreateUser(acct);
		}

		// Failed to fetch or resolve
		if (user == null) {
			throw new IdentifiableError('15348ddd-432d-49c2-8a5a-8069753becff', `Could not resolve user ${acct}`);
		}

		return user as MiLocalUser | MiRemoteUser;
	}

	@bindThis
	private async tryCreateUser(acct: string): Promise<MiRemoteUser | null> {
		try {
			const self = await this.resolveSelf(acct);

			if (this.utilityService.isUriLocal(self.href)) {
				this.logger.warn(`Ignoring WebFinger response for ${chalk.magenta(acct)}: remote URI points to a local user.`);
				return null;
			}

			this.logger.info(`Fetching new remote user ${chalk.magenta(acct)} from ${self.href}`);
			return await this.apPersonService.createPerson(self.href);
		} catch (err) {
			this.logger.warn(`Failed to resolve user ${acct}: ${renderInlineError(err)}`);
			return null;
		}
	}

	@bindThis
	private async tryUpdateUser(user: MiRemoteUser, acctLower: string): Promise<MiRemoteUser> {
		// Don't update unless the user is at least 24 hours outdated.
		// ユーザー情報が古い場合は、WebFingerからやりなおして返す
		if (user.lastFetchedAt != null && this.timeService.now - user.lastFetchedAt.getTime() <= 1000 * 60 * 60 * 24) {
			return user;
		}

		try {
			// Resolve via webfinger
			const self = await this.resolveSelf(acctLower);

			// Update the user
			await this.tryUpdateUri(user, acctLower, self.href);
			await this.apPersonService.updatePerson(self.href);
		} catch (err) {
			this.logger.warn(`Could not update user ${acctLower}; will continue with outdated local copy: ${renderInlineError(err)}`);
		} finally {
			// Always mark as updated so we don't get stuck here for missing remote users.
			// 繋がらないインスタンスに何回も試行するのを防ぐ, 後続の同様処理の連続試行を防ぐ ため 試行前にも更新する
			await this.usersRepository.update(user.id, {
				lastFetchedAt: this.timeService.date,
			});
		}

		// Reload user
		return await this.cacheService.findRemoteUserById(user.id);
	}

	@bindThis
	private async tryUpdateUri(user: MiRemoteUser, acct: string, href: string): Promise<void> {
		// Only update if there's actually a mismatch
		if (user.uri === href) {
			return;
		}

		// if uri mismatch, Fix (user@host <=> AP's Person id(RemoteUser.uri)) mapping.
		this.logger.warn(`Detected URI mismatch for ${acct}`);

		// validate uri
		const uriHost = this.utilityService.extractDbHost(href);
		if (uriHost !== user.host) {
			throw new Error(`Failed to correct URI for ${acct}: new URI ${href} has different host from previous URI ${user.uri}`);
		}

		// Update URI
		await this.usersRepository.update({ id: user.id }, { uri: href }); // Update the user
		await this.apPersonService.uriPersonCache.delete(user.uri); // Unmap the old URI
		await this.internalEventService.emit('remoteUserUpdated', { id: user.id }); // Update caches

		this.logger.info(`Corrected URI for ${acct} from ${user.uri} to ${href}`);
	}

	@bindThis
	private async resolveSelf(acctLower: string): Promise<ILink> {
		const finger = await this.webfingerService.webfinger(acctLower).catch(err => {
			this.logger.error(`Failed to WebFinger for ${chalk.yellow(acctLower)}: ${renderInlineError(err)}`);
			throw new Error(`Failed to WebFinger for ${acctLower}: error thrown`, { cause: err });
		});
		const self = finger.links.find(link => link.rel != null && link.rel.toLowerCase() === 'self');
		if (!self) {
			this.logger.error(`Failed to WebFinger for ${chalk.yellow(acctLower)}: self link not found`);
			throw new Error(`Failed to WebFinger for ${acctLower}: self link not found`);
		}
		return self;
	}
}
