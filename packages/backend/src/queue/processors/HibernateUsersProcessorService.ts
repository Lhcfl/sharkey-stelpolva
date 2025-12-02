/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In, LessThan } from 'typeorm';
import { QueueLoggerService } from '@/queue/QueueLoggerService.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { CacheService } from '@/core/CacheService.js';
import { TimeService } from '@/global/TimeService.js';
import type { FollowingsRepository, UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';

@Injectable()
export class HibernateUsersProcessorService {
	private readonly logger: Logger;

	constructor(
		@Inject(DI.usersRepository)
		private readonly usersRepository: UsersRepository,

		@Inject(DI.followingsRepository)
		private readonly followingsRepository: FollowingsRepository,

		private readonly cacheService: CacheService,
		private readonly timeService: TimeService,

		queueLoggerService: QueueLoggerService,
	) {
		this.logger = queueLoggerService.logger.createSubLogger('hibernate-users');
	}

	@bindThis
	public async process() {
		try {
			let totalHibernated = 0;

			// Any users last active *before* this date should be hibernated
			const hibernationThreshold = new Date(this.timeService.now - (1000 * 60 * 60 * 24 * 50));

			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			while (true) {
				// Work in batches of 100
				const page = await this.usersRepository.find({
					where: { isHibernated: false, lastActiveDate: LessThan(hibernationThreshold) },
					select: { id: true },
					take: 100,
				}) as { id: string }[];
				const ids = page.map(u => u.id);

				// Stop when we get them all
				if (ids.length < 1) break;

				await this.usersRepository.update({ id: In(ids) }, { isHibernated: true });
				await this.followingsRepository.update({ followerId: In(ids) }, { isFollowerHibernated: true });
				await this.cacheService.hibernatedUserCache.refreshMany(ids);

				totalHibernated += ids.length;
			}

			if (totalHibernated > 0) {
				this.logger.info(`Hibernated ${totalHibernated} inactive users`);
			} else {
				this.logger.debug('Skipping hibernation: nothing to do');
			}
		} catch (err) {
			this.logger.error(`Error hibernating users: ${renderInlineError(err)}`);
		}
	}
}
