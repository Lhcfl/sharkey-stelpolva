/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import chalk from 'chalk';
import { IsNull } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { UsersRepository } from '@/models/_.js';
import type { MiLocalUser, MiRemoteUser } from '@/models/User.js';
import type { Config } from '@/config.js';
import type Logger from '@/logger.js';
import { UtilityService } from '@/core/UtilityService.js';
import { ILink, WebfingerService } from '@/core/WebfingerService.js';
import { RemoteLoggerService } from '@/core/RemoteLoggerService.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import { bindThis } from '@/decorators.js';
import { renderInlineError } from '@/misc/render-inline-error.js';

@Injectable()
export class RemoteUserResolveService {
	private logger: Logger;

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
	) {
		this.logger = this.remoteLoggerService.logger.createSubLogger('resolve-user');
	}

	@bindThis
	public async resolveUser(username: string, host: string | null): Promise<MiLocalUser | MiRemoteUser> {
		const usernameLower = username.toLowerCase();

		if (host == null) {
			return await this.usersRepository.findOneByOrFail({ usernameLower, host: IsNull() }) as MiLocalUser;
		}

		host = this.utilityService.toPuny(host);

		if (host === this.utilityService.toPuny(this.config.host)) {
			return await this.usersRepository.findOneByOrFail({ usernameLower, host: IsNull() }) as MiLocalUser;
		}

		const user = await this.usersRepository.findOneBy({ usernameLower, host }) as MiRemoteUser | null;

		const acctLower = `${usernameLower}@${host}`;

		if (user == null) {
			const self = await this.resolveSelf(acctLower);

			if (this.utilityService.isUriLocal(self.href)) {
				const local = this.apDbResolverService.parseUri(self.href);
				if (local.local && local.type === 'users') {
					// the LR points to local
					return (await this.apDbResolverService
						.getUserFromApId(self.href)
						.then((u) => {
							if (u == null) {
								throw new Error(`local user not found: ${self.href}`);
							} else {
								return u;
							}
						})) as MiLocalUser;
				}
			}

			this.logger.info(`Fetching new remote user ${chalk.magenta(acctLower)} from ${self.href}`);
			return await this.apPersonService.createPerson(self.href);
		}

		// ユーザー情報が古い場合は、WebFingerからやりなおして返す
		if (user.lastFetchedAt == null || Date.now() - user.lastFetchedAt.getTime() > 1000 * 60 * 60 * 24) {
			// 繋がらないインスタンスに何回も試行するのを防ぐ, 後続の同様処理の連続試行を防ぐ ため 試行前にも更新する
			await this.usersRepository.update(user.id, {
				lastFetchedAt: new Date(),
			});

			const self = await this.resolveSelf(acctLower);

			if (user.uri !== self.href) {
				// if uri mismatch, Fix (user@host <=> AP's Person id(RemoteUser.uri)) mapping.
				this.logger.warn(`Detected URI mismatch for ${acctLower}`);

				// validate uri
				const uriHost = this.utilityService.extractDbHost(self.href);
				if (uriHost !== host) {
					throw new Error(`Failed to correct URI for ${acctLower}: new URI ${self.href} has different host from previous URI ${user.uri}`);
				}

				await this.usersRepository.update({
					usernameLower,
					host: host,
				}, {
					uri: self.href,
				});
			}

			this.logger.info(`Corrected URI for ${acctLower} from ${user.uri} to ${self.href}`);

			await this.apPersonService.updatePerson(self.href);

			return await this.usersRepository.findOneByOrFail({ uri: self.href }) as MiLocalUser | MiRemoteUser;
		}

		return user;
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
