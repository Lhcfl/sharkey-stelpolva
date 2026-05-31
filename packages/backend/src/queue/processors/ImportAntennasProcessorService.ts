/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import _Ajv from 'ajv';
import type { Logger } from '@/logger.js';
import type { AntennasRepository, UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { IdService } from '@/core/IdService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { TimeService } from '@/global/TimeService.js';
import { QueueLoggerService } from '@/queue/QueueLoggerService.js';
import type { DbImportAntennasJobData } from '../types.js';
import type * as Bull from 'bullmq';

const Ajv = _Ajv.default;

const validate = new Ajv().compile({
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1, maxLength: 100 },
		src: { type: 'string', enum: ['home', 'all', 'users', 'list'] },
		userListAccts: {
			type: 'array',
			items: {
				type: 'string',
			},
			nullable: true,
		},
		keywords: { type: 'array', items: {
			type: 'array', items: {
				type: 'string',
			},
		} },
		excludeKeywords: { type: 'array', items: {
			type: 'array', items: {
				type: 'string',
			},
		} },
		users: { type: 'array', items: {
			type: 'string',
		} },
		caseSensitive: { type: 'boolean' },
		localOnly: { type: 'boolean' },
		excludeBots: { type: 'boolean' },
		withReplies: { type: 'boolean' },
		withFile: { type: 'boolean' },
	},
	required: ['name', 'src', 'keywords', 'excludeKeywords', 'users', 'caseSensitive', 'withReplies', 'withFile'],
});

@Injectable()
export class ImportAntennasProcessorService {
	private logger: Logger;

	constructor (
		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private queueLoggerService: QueueLoggerService,
		private idService: IdService,
		private notificationService: NotificationService,
		private readonly timeService: TimeService,
		private readonly internalEventService: InternalEventService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('import-antennas');
	}

	@bindThis
	public async process(job: Bull.Job<DbImportAntennasJobData>): Promise<void> {
		const user = await this.usersRepository.findOneBy({ id: job.data.user.id });
		if (user == null) {
			this.logger.debug(`Skip: user ${job.data.user.id} does not exist`);
			return;
		}

		this.logger.debug(`Importing antennas of ${job.data.user.id} ...`);

		const now = this.timeService.date;
		try {
			// Check for legacy jobs
			const antennas = 'antenna' in job.data ? job.data.antenna : job.data.antennas;
			for (const antenna of antennas) {
				if (antenna.keywords.length === 0 || antenna.keywords[0].every(x => x === '')) continue;
				if (!validate(antenna)) {
					this.logger.warn('Antenna validation failed');
					continue;
				}
				const result = await this.antennasRepository.insertOne({
					id: this.idService.gen(now.getTime()),
					lastUsedAt: now,
					userId: job.data.user.id,
					name: antenna.name,
					src: antenna.src === 'list' && antenna.userListAccts ? 'users' : antenna.src,
					userListId: null,
					keywords: antenna.keywords,
					excludeKeywords: antenna.excludeKeywords,
					users: (antenna.src === 'list' && antenna.userListAccts !== null ? antenna.userListAccts : antenna.users).filter(Boolean),
					caseSensitive: antenna.caseSensitive,
					localOnly: antenna.localOnly,
					excludeBots: antenna.excludeBots,
					withReplies: antenna.withReplies,
					withFile: antenna.withFile,
				});
				this.logger.debug('Antenna created: ' + result.id);
				await this.internalEventService.emit('antennaCreated', result);
			}

			this.notificationService.createNotification(job.data.user.id, 'importCompleted', {
				importedEntity: 'antenna',
			});
		} catch (err) {
			this.logger.error(`Error importing antennas: ${renderInlineError(err)}`);
		}
	}
}
