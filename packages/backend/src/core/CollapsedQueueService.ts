/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { CollapsedQueue } from '@/misc/collapsed-queue.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { EnvService } from '@/global/EnvService.js';
import { bindThis } from '@/decorators.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import type { UsersRepository, NotesRepository, AccessTokensRepository, MiAntenna, FollowingsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { AntennaService } from '@/core/AntennaService.js';
import { CacheService } from '@/core/CacheService.js';
import { TimeService } from '@/global/TimeService.js';

export type UpdateInstanceJob = {
	latestRequestReceivedAt?: Date,
	notRespondingSince?: Date | null,
	shouldUnsuspend?: boolean,
	shouldSuspendGone?: boolean,
	shouldSuspendNotResponding?: boolean,
	notesCountDelta?: number,
	usersCountDelta?: number,
	followingCountDelta?: number,
	followersCountDelta?: number,
};

export type UpdateUserJob = {
	updatedAt?: Date,
	lastActiveDate?: Date,
	notesCountDelta?: number,
	followingCountDelta?: number,
	followersCountDelta?: number,
};

export type UpdateNoteJob = {
	repliesCountDelta?: number;
	renoteCountDelta?: number;
	clippedCountDelta?: number;
};

export type UpdateAccessTokenJob = {
	lastUsedAt: Date;
};

export type UpdateAntennaJob = {
	isActive: boolean,
	lastUsedAt?: Date,
};

@Injectable()
export class CollapsedQueueService implements OnApplicationShutdown {
	// Moved from InboxProcessorService
	public readonly updateInstanceQueue: CollapsedQueue<UpdateInstanceJob>;

	// Moved from NoteCreateService, NoteEditService, and NoteDeleteService
	public readonly updateUserQueue: CollapsedQueue<UpdateUserJob>;

	public readonly updateNoteQueue: CollapsedQueue<UpdateNoteJob>;
	public readonly updateAccessTokenQueue: CollapsedQueue<UpdateAccessTokenJob>;
	public readonly updateAntennaQueue: CollapsedQueue<UpdateAntennaJob>;

	private readonly logger: Logger;

	constructor(
		@Inject(DI.usersRepository)
		private readonly usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private readonly notesRepository: NotesRepository,

		@Inject(DI.accessTokensRepository)
		private readonly accessTokensRepository: AccessTokensRepository,

		@Inject(DI.followingsRepository)
		private readonly followingsRepository: FollowingsRepository,

		private readonly federatedInstanceService: FederatedInstanceService,
		private readonly envService: EnvService,
		private readonly internalEventService: InternalEventService,
		private readonly antennaService: AntennaService,
		private readonly cacheService: CacheService,
		private readonly timeService: TimeService,

		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('collapsed-queue');

		const fiveMinuteInterval = this.envService.env.NODE_ENV !== 'test' ? 60 * 1000 * 5 : 0;
		const oneMinuteInterval = this.envService.env.NODE_ENV !== 'test' ? 60 * 1000 : 0;

		this.updateInstanceQueue = new CollapsedQueue(
			this.internalEventService,
			this.timeService,
			'updateInstance',
			fiveMinuteInterval,
			(oldJob, newJob) => ({
				latestRequestReceivedAt: maxDate(oldJob.latestRequestReceivedAt, newJob.latestRequestReceivedAt),
				notRespondingSince: maxDate(oldJob.notRespondingSince, newJob.notRespondingSince),
				shouldUnsuspend: oldJob.shouldUnsuspend || newJob.shouldUnsuspend,
				shouldSuspendGone: oldJob.shouldSuspendGone || newJob.shouldSuspendGone,
				shouldSuspendNotResponding: oldJob.shouldSuspendNotResponding || newJob.shouldSuspendNotResponding,
				notesCountDelta: (oldJob.notesCountDelta ?? 0) + (newJob.notesCountDelta ?? 0),
				usersCountDelta: (oldJob.usersCountDelta ?? 0) + (newJob.usersCountDelta ?? 0),
				followingCountDelta: (oldJob.followingCountDelta ?? 0) + (newJob.followingCountDelta ?? 0),
				followersCountDelta: (oldJob.followersCountDelta ?? 0) + (newJob.followersCountDelta ?? 0),
			}),
			async (id, job) => {
				// Have to check this because all properties are optional
				if (
					job.latestRequestReceivedAt ||
					job.notRespondingSince !== undefined ||
					job.shouldSuspendNotResponding ||
					job.shouldSuspendGone ||
					job.shouldUnsuspend ||
					job.notesCountDelta ||
					job.usersCountDelta ||
					job.followingCountDelta ||
					job.followersCountDelta
				) {
					await this.federatedInstanceService.update(id, {
						// Direct update if defined
						latestRequestReceivedAt: job.latestRequestReceivedAt,

						// null (responding) > Date (not responding)
						notRespondingSince: job.latestRequestReceivedAt
							? null
							: job.notRespondingSince,

						// false (responding) > true (not responding)
						isNotResponding: job.latestRequestReceivedAt
							? false
							: job.notRespondingSince
								? true
								: undefined,

						// gone > none > auto
						suspensionState: job.shouldSuspendGone
							? 'goneSuspended'
							: job.shouldUnsuspend
								? 'none'
								: job.shouldSuspendNotResponding
									? 'autoSuspendedForNotResponding'
									: undefined,

						// Increment if defined
						notesCount: job.notesCountDelta ? () => `"notesCount" + ${job.notesCountDelta}` : undefined,
						usersCount: job.usersCountDelta ? () => `"usersCount" + ${job.usersCountDelta}` : undefined,
						followingCount: job.followingCountDelta ? () => `"followingCount" + ${job.followingCountDelta}` : undefined,
						followersCount: job.followersCountDelta ? () => `"followersCount" + ${job.followersCountDelta}` : undefined,
					});
				}
			},
			{
				onError: this.onQueueError,
				concurrency: 2, // Low concurrency, this table is slow for some reason
				redisParser: data => ({
					...data,
					latestRequestReceivedAt: data.latestRequestReceivedAt != null
						? new Date(data.latestRequestReceivedAt)
						: data.latestRequestReceivedAt,
					notRespondingSince: data.notRespondingSince != null
						? new Date(data.notRespondingSince)
						: data.notRespondingSince,
				}),
			},
		);

		this.updateUserQueue = new CollapsedQueue(
			this.internalEventService,
			this.timeService,
			'updateUser',
			oneMinuteInterval,
			(oldJob, newJob) => ({
				updatedAt: maxDate(oldJob.updatedAt, newJob.updatedAt),
				lastActiveDate: maxDate(oldJob.lastActiveDate, newJob.lastActiveDate),
				notesCountDelta: (oldJob.notesCountDelta ?? 0) + (newJob.notesCountDelta ?? 0),
				followingCountDelta: (oldJob.followingCountDelta ?? 0) + (newJob.followingCountDelta ?? 0),
				followersCountDelta: (oldJob.followersCountDelta ?? 0) + (newJob.followersCountDelta ?? 0),
			}),
			async (id, job) => {
				// Have to check this because all properties are optional
				if (job.updatedAt || job.lastActiveDate || job.notesCountDelta || job.followingCountDelta || job.followersCountDelta) {
					// Updating the user should implicitly mark them as active
					const lastActiveDate = job.lastActiveDate ?? job.updatedAt;
					const isWakingUp = lastActiveDate && (await this.cacheService.findUserById(id)).isHibernated;

					// Update user before the hibernation cache, because the latter may refresh from DB
					await this.usersRepository.update({ id }, {
						updatedAt: job.updatedAt,
						lastActiveDate,
						isHibernated: isWakingUp ? false : undefined,
						notesCount: job.notesCountDelta ? () => `"notesCount" + ${job.notesCountDelta}` : undefined,
						followingCount: job.followingCountDelta ? () => `"followingCount" + ${job.followingCountDelta}` : undefined,
						followersCount: job.followersCountDelta ? () => `"followersCount" + ${job.followersCountDelta}` : undefined,
					});
					await this.internalEventService.emit('userUpdated', { id });

					// Wake up hibernated users
					if (isWakingUp) {
						await this.followingsRepository.update({ followerId: id }, { isFollowerHibernated: false });
						await this.cacheService.hibernatedUserCache.set(id, false);
					}
				}
			},
			{
				onError: this.onQueueError,
				concurrency: 4, // High concurrency - this queue gets a lot of activity
				redisParser: data => ({
					...data,
					updatedAt: data.updatedAt != null
						? new Date(data.updatedAt)
						: data.updatedAt,
					lastActiveDate: data.lastActiveDate != null
						? new Date(data.lastActiveDate)
						: data.lastActiveDate,
				}),
			},
		);

		this.updateNoteQueue = new CollapsedQueue(
			this.internalEventService,
			this.timeService,
			'updateNote',
			oneMinuteInterval,
			(oldJob, newJob) => ({
				repliesCountDelta: (oldJob.repliesCountDelta ?? 0) + (newJob.repliesCountDelta ?? 0),
				renoteCountDelta: (oldJob.renoteCountDelta ?? 0) + (newJob.renoteCountDelta ?? 0),
				clippedCountDelta: (oldJob.clippedCountDelta ?? 0) + (newJob.clippedCountDelta ?? 0),
			}),
			async (id, job) => {
				// Have to check this because all properties are optional
				if (job.repliesCountDelta || job.renoteCountDelta || job.clippedCountDelta) {
					await this.notesRepository.update({ id }, {
						repliesCount: job.repliesCountDelta ? () => `"repliesCount" + ${job.repliesCountDelta}` : undefined,
						renoteCount: job.renoteCountDelta ? () => `"renoteCount" + ${job.renoteCountDelta}` : undefined,
						clippedCount: job.clippedCountDelta ? () => `"clippedCount" + ${job.clippedCountDelta}` : undefined,
					});
				}
			},
			{
				onError: this.onQueueError,
				concurrency: 4, // High concurrency - this queue gets a lot of activity
			},
		);

		this.updateAccessTokenQueue = new CollapsedQueue(
			this.internalEventService,
			this.timeService,
			'updateAccessToken',
			fiveMinuteInterval,
			(oldJob, newJob) => ({
				lastUsedAt: maxDate(oldJob.lastUsedAt, newJob.lastUsedAt),
			}),
			async (id, job) => await this.accessTokensRepository.update({ id }, {
				lastUsedAt: job.lastUsedAt,
			}),
			{
				onError: this.onQueueError,
				concurrency: 2,
				redisParser: data => ({
					...data,
					lastUsedAt: new Date(data.lastUsedAt),
				}),
			},
		);

		this.updateAntennaQueue = new CollapsedQueue(
			this.internalEventService,
			this.timeService,
			'updateAntenna',
			fiveMinuteInterval,
			(oldJob, newJob) => ({
				isActive: oldJob.isActive || newJob.isActive,
				lastUsedAt: maxDate(oldJob.lastUsedAt, newJob.lastUsedAt),
			}),
			async (id, job) => await this.antennaService.updateAntenna(id, {
				isActive: job.isActive,
				lastUsedAt: job.lastUsedAt,
			}),
			{
				onError: this.onQueueError,
				concurrency: 4,
				redisParser: data => ({
					...data,
					lastUsedAt: data.lastUsedAt != null
						? new Date(data.lastUsedAt)
						: data.lastUsedAt,
				}),
			},
		);

		this.internalEventService.on('userChangeDeletedState', this.onUserDeleted);
		this.internalEventService.on('antennaDeleted', this.onAntennaDeleted);
		this.internalEventService.on('antennaUpdated', this.onAntennaDeleted);
	}

	@bindThis
	private async performQueue<V>(queue: CollapsedQueue<V>): Promise<void> {
		try {
			const results = await queue.performAllNow();

			const [succeeded, failed] = results.reduce((counts, result) => {
				counts[result ? 0 : 1]++;
				return counts;
			}, [0, 0]);

			this.logger.debug(`Persistence completed for ${queue.name}: ${succeeded} succeeded and ${failed} failed`);
		} catch (err) {
			this.logger.error(`Persistence failed for ${queue.name}: ${renderInlineError(err)}`);
		}
	}

	@bindThis
	private onQueueError<V>(queue: CollapsedQueue<V>, error: unknown): void {
		this.logger.error(`Error persisting ${queue.name}: ${renderInlineError(error)}`);
	}

	@bindThis
	private async onUserDeleted(data: { id: string, isDeleted: boolean }) {
		if (data.isDeleted) {
			await this.updateUserQueue.delete(data.id);
		}
	}

	@bindThis
	private async onAntennaDeleted(data: MiAntenna) {
		await this.updateAntennaQueue.delete(data.id);
	}

	@bindThis
	async dispose() {
		this.internalEventService.off('userChangeDeletedState', this.onUserDeleted);
		this.internalEventService.off('antennaDeleted', this.onAntennaDeleted);
		this.internalEventService.off('antennaUpdated', this.onAntennaDeleted);

		this.logger.info('Persisting all collapsed queues...');

		await this.performQueue(this.updateInstanceQueue);
		await this.performQueue(this.updateUserQueue);
		await this.performQueue(this.updateNoteQueue);
		await this.performQueue(this.updateAccessTokenQueue);
		await this.performQueue(this.updateAntennaQueue);

		this.logger.info('Persistence complete.');
	}

	async onApplicationShutdown() {
		await this.dispose();
	}
}

function maxDate(first: Date | undefined, second: Date): Date;
function maxDate(first: Date, second: Date | undefined): Date;
function maxDate(first: Date | undefined, second: Date | undefined): Date | undefined;
function maxDate(first: Date | null | undefined, second: Date | null | undefined): Date | null | undefined;

function maxDate(first: Date | null | undefined, second: Date | null | undefined): Date | null | undefined {
	if (first !== undefined && second !== undefined) {
		if (first != null && second != null) {
			if (first.getTime() > second.getTime()) {
				return first;
			} else {
				return second;
			}
		} else {
			// Null is considered infinitely in the future, and is therefore newer than any date.
			return null;
		}
	} else if (first !== undefined) {
		return first;
	} else if (second !== undefined) {
		return second;
	} else {
		// Undefined in considered infinitely in the past, and is therefore older than any date.
		return undefined;
	}
}
