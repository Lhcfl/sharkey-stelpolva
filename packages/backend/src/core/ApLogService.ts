/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { In, LessThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { SkApFetchLog, SkApInboxLog, SkApContext } from '@/models/_.js';
import type { ApContextsRepository, ApFetchLogsRepository, ApInboxLogsRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import { JsonValue } from '@/misc/json-value.js';
import { UtilityService } from '@/core/UtilityService.js';
import { TimeService } from '@/global/TimeService.js';
import { IdService } from '@/core/IdService.js';
import { IActivity, IObject } from '@/core/activitypub/type.js';
import { bindThis } from '@/decorators.js';
import { QueueService } from '@/core/QueueService.js';

@Injectable()
export class ApLogService {
	constructor(
		@Inject(DI.config)
		private readonly config: Config,

		@Inject(DI.apContextsRepository)
		private readonly apContextsRepository: ApContextsRepository,

		@Inject(DI.apInboxLogsRepository)
		private readonly apInboxLogsRepository: ApInboxLogsRepository,

		@Inject(DI.apFetchLogsRepository)
		private readonly apFetchLogsRepository: ApFetchLogsRepository,

		private readonly utilityService: UtilityService,
		private readonly idService: IdService,
		private readonly timeService: TimeService,
		private readonly queueService: QueueService,
	) {}

	/**
	 * Creates an inbox log from an activity, and saves it if pre-save is enabled.
	 */
	public async createInboxLog(data: Partial<SkApInboxLog> & {
		activity: IActivity,
		keyId: string,
	}): Promise<SkApInboxLog> {
		const { object: activity, context, contextHash } = extractObjectContext(data.activity);
		const host = this.utilityService.extractDbHost(data.keyId);

		const log = new SkApInboxLog({
			id: this.idService.gen(),
			at: this.timeService.date,
			verified: false,
			accepted: false,
			host,
			...data,
			activity,
			context,
			contextHash,
		});

		if (this.config.activityLogging.preSave) {
			await this.saveInboxLog(log);
		}

		return log;
	}

	/**
	 * Saves or finalizes an inbox log.
	 */
	public async saveInboxLog(log: SkApInboxLog): Promise<SkApInboxLog> {
		if (log.context) {
			await this.saveContext(log.context);
		}

		// Will be UPDATE with preSave, and INSERT without.
		await this.apInboxLogsRepository.upsert(log, ['id']);
		return log;
	}

	/**
	 * Creates a fetch log from an activity, and saves it if pre-save is enabled.
	 */
	public async createFetchLog(data: Partial<SkApFetchLog> & {
		requestUri: string
		host: string,
	}): Promise<SkApFetchLog> {
		const log = new SkApFetchLog({
			id: this.idService.gen(),
			at: this.timeService.date,
			accepted: false,
			...data,
		});

		if (this.config.activityLogging.preSave) {
			await this.saveFetchLog(log);
		}

		return log;
	}

	/**
	 * Saves or finalizes a fetch log.
	 */
	public async saveFetchLog(log: SkApFetchLog): Promise<SkApFetchLog> {
		if (log.context) {
			await this.saveContext(log.context);
		}

		// Will be UPDATE with preSave, and INSERT without.
		await this.apFetchLogsRepository.upsert(log, ['id']);
		return log;
	}

	private async saveContext(context: SkApContext): Promise<void> {
		// https://stackoverflow.com/a/47064558
		await this.apContextsRepository
			.createQueryBuilder('activity_context')
			.insert()
			.into(SkApContext)
			.values(context)
			.orIgnore('md5')
			.execute();
	}

	@bindThis
	public async deleteObjectLogsDeferred(objectUris: string | string[]): Promise<void> {
		await this.queueService.createDeleteApLogsJob('object', objectUris);
	}

	@bindThis
	public async deleteInboxLogsDeferred(userIds: string | string[]): Promise<void> {
		await this.queueService.createDeleteApLogsJob('inbox', userIds);
	}

	/**
	 * Deletes all logged copies of an object or objects
	 * @param objectUris URIs / AP IDs of the objects to delete
	 */
	public async deleteObjectLogs(objectUris: string | string[]): Promise<number> {
		if (Array.isArray(objectUris)) {
			const logsDeleted = await this.apFetchLogsRepository.delete({
				objectUri: In(objectUris),
			});
			return logsDeleted.affected ?? 0;
		} else {
			const logsDeleted = await this.apFetchLogsRepository.delete({
				objectUri: objectUris,
			});
			return logsDeleted.affected ?? 0;
		}
	}

	/**
	 * Deletes all logged inbox activities from a user or users
	 * @param userIds IDs of the users to delete
	 */
	public async deleteInboxLogs(userIds: string | string[]): Promise<number> {
		if (Array.isArray(userIds)) {
			const logsDeleted = await this.apInboxLogsRepository.delete({
				authUserId: In(userIds),
			});
			return logsDeleted.affected ?? 0;
		} else {
			const logsDeleted = await this.apInboxLogsRepository.delete({
				authUserId: userIds,
			});
			return logsDeleted.affected ?? 0;
		}
	}

	/**
	 * Deletes all expired AP logs and garbage-collects the AP context cache.
	 * Returns the total number of deleted rows.
	 */
	public async deleteExpiredLogs(): Promise<number> {
		// This is the date in UTC of the oldest log to KEEP
		const oldestAllowed = new Date(this.timeService.now - this.config.activityLogging.maxAge);

		// Delete all logs older than the threshold.
		const inboxDeleted = await this.deleteExpiredInboxLogs(oldestAllowed);
		const fetchDeleted = await this.deleteExpiredFetchLogs(oldestAllowed);

		return inboxDeleted + fetchDeleted;
	}

	private async deleteExpiredInboxLogs(oldestAllowed: Date): Promise<number> {
		const { affected } = await this.apInboxLogsRepository.delete({
			at: LessThan(oldestAllowed),
		});

		return affected ?? 0;
	}

	private async deleteExpiredFetchLogs(oldestAllowed: Date): Promise<number> {
		const { affected } = await this.apFetchLogsRepository.delete({
			at: LessThan(oldestAllowed),
		});

		return affected ?? 0;
	}
}

export function extractObjectContext<T extends IObject>(input: T) {
	const object = Object.assign({}, input, { '@context': undefined }) as Omit<T, '@context'>;
	const { context, contextHash } = parseContext(input['@context']);

	return { object, context, contextHash };
}

export function parseContext(input: JsonValue | undefined): { contextHash: string | null, context: SkApContext | null } {
	// Empty contexts are excluded for easier querying
	if (input == null) {
		return {
			contextHash: null,
			context: null,
		};
	}

	const contextHash = createHash('md5').update(JSON.stringify(input)).digest('base64');
	const context = new SkApContext({
		md5: contextHash,
		json: input,
	});
	return { contextHash, context };
}

export function calculateDurationSince(startTime: bigint): number {
	// Calculate the processing time with correct rounding and decimals.
	// 1. Truncate nanoseconds to microseconds
	// 2. Scale to 1/10 millisecond ticks.
	// 3. Round to nearest tick.
	// 4. Sale to milliseconds
	// Example: 123,456,789 ns -> 123,456 us -> 12,345.6 ticks -> 12,346 ticks -> 123.46 ms
	const endTime = process.hrtime.bigint();
	return Math.round(Number((endTime - startTime) / 1000n) / 10) / 100;
}
