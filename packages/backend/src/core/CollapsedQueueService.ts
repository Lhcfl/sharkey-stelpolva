/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { bindThis } from '@/decorators.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import type {
	MiAntenna,
	FollowingsRepository,
	ChannelsRepository,
	AntennasRepository,
	AccessTokensRepository,
	NotesRepository,
	UsersRepository,
	InstancesRepository,
} from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { CacheManagementService, type ManagedCollapsedQueue } from '@/global/CacheManagementService.js';
import { AntennaService } from '@/core/AntennaService.js';
import { CacheService } from '@/core/CacheService.js';
import type { Brackets, ObjectLiteral, Repository, UpdateQueryBuilder, PartialEntityUpdate } from 'typeorm';

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
	lastUsedAt?: Date;
};

export type UpdateAntennaJob = {
	isActive?: boolean,
	lastUsedAt?: Date,
};

export type UpdateChannelJob = {
	lastNotedAt?: Date,
	notesCountDelta?: number,
	usersCountDelta?: number,
};

const oneMinute = 60 * 1000;
const thirtySeconds = 1000 * 30;

@Injectable()
export class CollapsedQueueService implements OnApplicationShutdown {
	// Moved from InboxProcessorService
	public readonly updateInstanceQueue: ManagedCollapsedQueue<UpdateInstanceJob>;

	// Moved from NoteCreateService, NoteEditService, and NoteDeleteService
	public readonly updateUserQueue: ManagedCollapsedQueue<UpdateUserJob>;

	public readonly updateNoteQueue: ManagedCollapsedQueue<UpdateNoteJob>;
	public readonly updateAccessTokenQueue: ManagedCollapsedQueue<UpdateAccessTokenJob>;
	public readonly updateAntennaQueue: ManagedCollapsedQueue<UpdateAntennaJob>;
	public readonly updateChannelQueue: ManagedCollapsedQueue<UpdateChannelJob>;

	constructor(
		@Inject(DI.followingsRepository)
		private readonly followingsRepository: FollowingsRepository,

		@Inject(DI.channelsRepository)
		private readonly channelsRepository: ChannelsRepository,

		@Inject(DI.antennasRepository)
		private readonly antennasRepository: AntennasRepository,

		@Inject(DI.accessTokensRepository)
		private readonly accessTokensRepository: AccessTokensRepository,

		@Inject(DI.notesRepository)
		private readonly notesRepository: NotesRepository,

		@Inject(DI.usersRepository)
		private readonly usersRepository: UsersRepository,

		@Inject(DI.instancesRepository)
		private readonly instancesRepository: InstancesRepository,

		private readonly federatedInstanceService: FederatedInstanceService,
		private readonly internalEventService: InternalEventService,
		private readonly antennaService: AntennaService,
		private readonly cacheService: CacheService,
		private readonly cacheManagementService: CacheManagementService,
	) {
		this.updateInstanceQueue = this.cacheManagementService.createCollapsedQueue(
			'updateInstance',
			{
				timeout: oneMinute,
				limiter: 2, // Low concurrency, this table is slow for some reason
				collapse: (oldJob, newJob) => ({
					latestRequestReceivedAt: maxDate(oldJob.latestRequestReceivedAt, newJob.latestRequestReceivedAt),
					notRespondingSince: minDate(oldJob.notRespondingSince, newJob.notRespondingSince),
					shouldUnsuspend: or(oldJob.shouldUnsuspend, newJob.shouldUnsuspend),
					shouldSuspendGone: or(oldJob.shouldSuspendGone, newJob.shouldSuspendGone),
					shouldSuspendNotResponding: or(oldJob.shouldSuspendNotResponding, newJob.shouldSuspendNotResponding),
					notesCountDelta: sum(oldJob.notesCountDelta, newJob.notesCountDelta),
					usersCountDelta: sum(oldJob.usersCountDelta, newJob.usersCountDelta),
					followingCountDelta: sum(oldJob.followingCountDelta, newJob.followingCountDelta),
					followersCountDelta: sum(oldJob.followersCountDelta, newJob.followersCountDelta),
				}),
				check: (_, job) =>
					job.notRespondingSince !== undefined ||
					job.latestRequestReceivedAt !== undefined ||
					job.shouldSuspendNotResponding || // exclude false too
					job.shouldSuspendGone ||
					job.shouldUnsuspend ||
					!!job.notesCountDelta || // exclude 0 too
					!!job.usersCountDelta ||
					!!job.followingCountDelta ||
					!!job.followersCountDelta,
				perform: async (host, job) => {
					const qb = new UpdateBuilder(this.instancesRepository, 'instance')
						.where({ host });

					if (job.latestRequestReceivedAt !== undefined) {
						qb.setSql('latestRequestReceivedAt', 'GREATEST("latestRequestReceivedAt", :latestRequestReceivedAt)', { latestRequestReceivedAt: job.latestRequestReceivedAt });
					}

					// null (responding) > Date (not responding)
					if (job.notRespondingSince != null) {
						qb.setSql('notRespondingSince', `
							CASE
								WHEN "notRespondingSince" IS NULL THEN NULL
								ELSE LEAST("notRespondingSince", :notRespondingSince)
							END
						`, { notRespondingSince: job.notRespondingSince });
					} else if (job.notRespondingSince === null) {
						qb.setValue('notRespondingSince', null);
					}

					// isNotResponding derives from latestRequestReceivedAt and notRespondingSince
					if (job.latestRequestReceivedAt || job.notRespondingSince !== undefined) {
						if (job.latestRequestReceivedAt || job.notRespondingSince === null) {
							qb.setValue('isNotResponding', false);
						} else {
							// TODO this should be atomic
							qb.setValue('isNotResponding', true);
						}
					}

					// manual > gone > none > auto
					if (job.shouldSuspendGone) {
						qb.setSql('suspensionState', `
							CASE
								WHEN "suspensionState" = 'manuallySuspended' THEN 'manuallySuspended'::instance_suspensionstate_enum
								ELSE 'goneSuspended'::instance_suspensionstate_enum
							END
						`);
					} else if (job.shouldUnsuspend) {
						qb.setSql('suspensionState', `
							CASE
								WHEN "suspensionState" = 'manuallySuspended' THEN 'manuallySuspended'::instance_suspensionstate_enum
								WHEN "suspensionState" = 'goneSuspended' THEN 'goneSuspended'::instance_suspensionstate_enum
								ELSE 'none'::instance_suspensionstate_enum
							END
						`);
					} else if (job.shouldSuspendNotResponding) {
						qb.setSql('suspensionState', `
							CASE
									WHEN "suspensionState" = 'manuallySuspended' THEN 'manuallySuspended'::instance_suspensionstate_enum
									WHEN "suspensionState" = 'goneSuspended' THEN 'goneSuspended'::instance_suspensionstate_enum
									WHEN "notRespondingSince" IS NULL THEN 'none'::instance_suspensionstate_enum
									ELSE 'autoSuspendedForNotResponding'::instance_suspensionstate_enum
							END
						`);
					}

					if (job.notesCountDelta) {
						qb.setSql('notesCount', '"notesCount" + :notesCountDelta', { notesCountDelta: job.notesCountDelta });
					}

					if (job.usersCountDelta) {
						qb.setSql('usersCount', '"usersCount" + :usersCountDelta', { usersCountDelta: job.usersCountDelta });
					}

					if (job.followersCountDelta) {
						qb.setSql('followersCount', '"followersCount" + :followersCountDelta', { followersCountDelta: job.followersCountDelta });
					}

					if (job.followingCountDelta) {
						qb.setSql('followingCount', '"followingCount" + :followingCountDelta', { followingCountDelta: job.followingCountDelta });
					}

					// Update and sync caches
					await qb.execute();
					await this.federatedInstanceService.refresh('host');
				},
			},
		);

		this.updateUserQueue = this.cacheManagementService.createCollapsedQueue(
			'updateUser',
			{
				timeout: thirtySeconds,
				limiter: 4, // High concurrency - this queue gets a lot of activity
				collapse: (oldJob, newJob) => ({
					updatedAt: maxDate(oldJob.updatedAt, newJob.updatedAt),
					lastActiveDate: maxDate(oldJob.lastActiveDate, newJob.lastActiveDate),
					notesCountDelta: sum(oldJob.notesCountDelta, newJob.notesCountDelta),
					followingCountDelta: sum(oldJob.followingCountDelta, newJob.followingCountDelta),
					followersCountDelta: sum(oldJob.followersCountDelta, newJob.followersCountDelta),
				}),
				check: (_, job) =>
					job.updatedAt !== undefined ||
					job.lastActiveDate !== undefined ||
					!!job.notesCountDelta || // exclude 0 too
					!!job.followingCountDelta ||
					!!job.followersCountDelta,
				perform:
					async (id, job) => {
						const qb = new UpdateBuilder(this.usersRepository, 'user')
							.where({ id });

						if (job.updatedAt !== undefined) {
							qb.setSql('updatedAt', 'GREATEST("updatedAt", :updatedAt)', { updatedAt: job.updatedAt });
						}

						const lastActiveDate = job.lastActiveDate ?? job.updatedAt;
						if (lastActiveDate !== undefined) {
							qb.setSql('lastActiveDate', 'GREATEST("lastActiveDate", :lastActiveDate)', { lastActiveDate });
						}

						const isWakingUp = lastActiveDate != null && (await this.cacheService.findOptionalUserById(id))?.isHibernated;
						if (isWakingUp) {
							qb.setValue('isHibernated', false);
						}

						if (job.notesCountDelta) {
							qb.setSql('notesCount', '"notesCount" + :notesCountDelta', { notesCountDelta: job.notesCountDelta });
						}

						if (job.followersCountDelta) {
							qb.setSql('followersCount', '"followersCount" + :followersCountDelta', { followersCountDelta: job.followersCountDelta });
						}

						if (job.followingCountDelta) {
							qb.setSql('followingCount', '"followingCount" + :followingCountDelta', { followingCountDelta: job.followingCountDelta });
						}

						// Manually update and sync caches
						await qb.execute();
						await this.internalEventService.emit('userUpdated', { id });

						if (isWakingUp) {
							await this.followingsRepository.update({ followerId: id }, { isFollowerHibernated: false });
							await this.internalEventService.emit('userChangeHibernatedState', { id, isHibernated: false });
						}
					},
			},
		);

		this.updateNoteQueue = this.cacheManagementService.createCollapsedQueue(
			'updateNote',
			{
				timeout: thirtySeconds,
				limiter: 4, // High concurrency - this queue gets a lot of activity
				collapse: (oldJob, newJob) => ({
					repliesCountDelta: sum(oldJob.repliesCountDelta, newJob.repliesCountDelta),
					renoteCountDelta: sum(oldJob.renoteCountDelta, newJob.renoteCountDelta),
					clippedCountDelta: sum(oldJob.clippedCountDelta, newJob.clippedCountDelta),
				}),
				check: (_, job) =>
					!!job.repliesCountDelta || // exclude 0 too
					!!job.renoteCountDelta ||
					!!job.clippedCountDelta,
				perform: async (id, job) => {
					const qb = new UpdateBuilder(this.notesRepository, 'note')
						.where({ id });

					if (job.repliesCountDelta) {
						qb.setSql('repliesCount', '"repliesCount" + :repliesCountDelta', { repliesCountDelta: job.repliesCountDelta });
					}

					if (job.renoteCountDelta) {
						qb.setSql('renoteCount', '"renoteCount" + :renoteCountDelta', { renoteCountDelta: job.renoteCountDelta });
					}

					if (job.clippedCountDelta) {
						qb.setSql('clippedCount', '"clippedCount" + :clippedCountDelta', { clippedCountDelta: job.clippedCountDelta });
					}

					await qb.execute();
				},
			},
		);

		this.updateAccessTokenQueue = this.cacheManagementService.createCollapsedQueue(
			'updateAccessToken',
			{
				timeout: oneMinute,
				limiter: 2,
				collapse: (oldJob, newJob) => ({
					lastUsedAt: maxDate(oldJob.lastUsedAt, newJob.lastUsedAt),
				}),
				check: (_, job) =>
					job.lastUsedAt !== undefined,
				perform: async (id, job) => {
					const qb = new UpdateBuilder(this.accessTokensRepository, 'accessToken')
						.where({ id });

					if (job.lastUsedAt !== undefined) {
						qb.setSql('lastUsedAt', 'GREATEST("lastUsedAt", :lastUsedAt)', { lastUsedAt: job.lastUsedAt });
					}

					await qb.execute();
				},
			},
		);

		this.updateAntennaQueue = this.cacheManagementService.createCollapsedQueue(
			'updateAntenna',
			{
				timeout: oneMinute,
				limiter: 4,
				collapse: (oldJob, newJob) => ({
					isActive: or(oldJob.isActive, newJob.isActive),
					lastUsedAt: maxDate(oldJob.lastUsedAt, newJob.lastUsedAt),
				}),
				check: (_, job) =>
					job.isActive !== undefined ||
					job.lastUsedAt !== undefined,
				perform: async (id, job) => {
					const qb = new UpdateBuilder(this.antennasRepository, 'antenna')
						.where({ id });

					if (job.isActive !== undefined) {
						qb.setSql('isActive', '"isActive" OR :isActive', { isActive: job.isActive });
					}

					if (job.lastUsedAt !== undefined) {
						qb.setSql('lastUsedAt', 'GREATEST("lastUsedAt", :lastUsedAt)', { lastUsedAt: job.lastUsedAt });
					}

					// Update and sync caches
					await qb.execute();
					await this.antennaService.refreshAntenna(id);
				},
			},
		);

		this.updateChannelQueue = this.cacheManagementService.createCollapsedQueue(
			'updateChannel',
			{
				timeout: oneMinute,
				limiter: 4,
				collapse: (oldJob, newJob) => ({
					lastNotedAt: maxDate(oldJob.lastNotedAt, newJob.lastNotedAt),
					notesCountDelta: sum(oldJob.notesCountDelta, newJob.notesCountDelta),
					usersCountDelta: sum(oldJob.usersCountDelta, newJob.usersCountDelta),
				}),
				check: (_, job) =>
					job.lastNotedAt !== undefined ||
					!!job.notesCountDelta || // exclude 0 too
					!!job.usersCountDelta,
				perform: async (id, job) => {
					const qb = new UpdateBuilder(this.channelsRepository, 'channel')
						.where({ id });

					if (job.lastNotedAt !== undefined) {
						qb.setSql('lastNotedAt', 'GREATEST("lastNotedAt", :lastNotedAt)', { lastNotedAt: job.lastNotedAt });
					}

					if (job.notesCountDelta) {
						qb.setSql('notesCount', '"notesCount" + :notesCountDelta', { notesCountDelta: job.notesCountDelta });
					}

					if (job.usersCountDelta) {
						qb.setSql('usersCount', '"usersCount" + :usersCountDelta', { usersCountDelta: job.usersCountDelta });
					}

					await qb.execute();
				},
			},
		);

		this.internalEventService.on('userChangeDeletedState', this.onUserDeleted);
		this.internalEventService.on('antennaDeleted', this.onAntennaDeleted);
	}

	@bindThis
	private onUserDeleted(data: { id: string, isDeleted: boolean }) {
		if (data.isDeleted) {
			this.updateUserQueue.delete(data.id);
		}
	}

	@bindThis
	private onAntennaDeleted(data: MiAntenna) {
		this.updateAntennaQueue.delete(data.id);
	}

	@bindThis
	public dispose(): void {
		this.internalEventService.off('userChangeDeletedState', this.onUserDeleted);
		this.internalEventService.off('antennaDeleted', this.onAntennaDeleted);
	}

	@bindThis
	public onApplicationShutdown(): void {
		this.dispose();
	}
}

// TODO promote these to utilities

function maxDate(first: Date, second: Date): Date;
function maxDate(first: Date | null, second: Date | null): Date | null;
function maxDate(first: Date | undefined, second: Date | undefined): Date | undefined;
function maxDate(first: Date | null | undefined, second: Date | null | undefined): Date | null | undefined;

function maxDate(first: Date | null | undefined, second: Date | null | undefined): Date | null | undefined {
	// If we only have one entry, then the other is the max by default.
	if (first === undefined) {
		return second;
	}
	if (second === undefined) {
		return first;
	}

	// Null is considered infinitely in the future, and is therefore newer than any date.
	if (first === null || second === null) {
		return null;
	}

	// If both dates have values, then compare by raw time
	return first.getTime() > second.getTime()
		? first
		: second;
}

function minDate(first: Date, second: Date): Date;
function minDate(first: Date | null, second: Date | null): Date | null;
function minDate(first: Date | undefined, second: Date | undefined): Date | undefined;
function minDate(first: Date | null | undefined, second: Date | null | undefined): Date | null | undefined;

function minDate(first: Date | null | undefined, second: Date | null | undefined): Date | null | undefined {
	// If we only have one entry, then the other is the min by default.
	if (first === undefined) {
		return second;
	}
	if (second === undefined) {
		return first;
	}

	// Null is considered infinitely in the future, and is therefore newer than any date.
	if (first === null) {
		return second;
	}
	if (second === null) {
		return first;
	}

	// If both dates have values, then compare by raw time
	return first.getTime() < second.getTime()
		? first
		: second;
}

function sum(first: number, second: number): number;
function sum(first: number | null, second: number | null): number | null;
function sum(first: number | undefined, second: number | undefined): number | undefined;
function sum(first: number | null | undefined, second: number | null | undefined): number | null | undefined;

function sum(first: number | null | undefined, second: number | null | undefined): number | null | undefined {
	// If we only have one entry, then the other is the result byDefault
	if (first === undefined) {
		return second;
	}
	if (second === undefined) {
		return first;
	}

	// Null is considered infinitely high, and is therefore higher than any other number.
	if (first === null || second === null) {
		return null;
	}

	// If both numbers are defined, then add directly.
	return first + second;
}

function or(first: boolean, second: boolean): boolean;
function or(first: boolean | null, second: boolean | null): boolean | null;
function or(first: boolean | undefined, second: boolean | undefined): boolean | undefined;
function or(first: boolean | null | undefined, second: boolean | null | undefined): boolean | null | undefined;

function or(first: boolean | null | undefined, second: boolean | null | undefined): boolean | null | undefined {
	// If we only have one entry, then the other is the result byDefault
	if (first === undefined) {
		return second;
	}
	if (second === undefined) {
		return first;
	}

	// Null is considered infinitely true, and is therefore truer than any other boolean.
	if (first === null || second === null) {
		return null;
	}

	// If both booleans are defined, then compare directly.
	return first || second;
}

class UpdateBuilder<T extends ObjectLiteral> {
	private readonly qb: UpdateQueryBuilder<T>;
	private readonly updates: UpdateHash<T> = {};

	constructor(
		repository: Repository<T>,
		private readonly alias: string,
	) {
		this.qb = repository.createQueryBuilder(alias).update();
	}

	/**
	 * Sets WHERE condition in the query builder.
	 * If you had previously WHERE expression defined,
	 * calling this function will override previously set WHERE conditions.
	 * Additionally you can add parameters used in where expression.
	 */
	@bindThis
	public where(where: string | ((qb: UpdateQueryBuilder<T>) => string) | Brackets | ObjectLiteral | ObjectLiteral[], parameters?: ObjectLiteral): this {
		this.qb.where(where, parameters);
		return this;
	}

	/**
	 * Adds new AND WHERE condition in the query builder.
	 * Additionally you can add parameters used in where expression.
	 */
	@bindThis
	public andWhere(where: string | ((qb: UpdateQueryBuilder<T>) => string) | Brackets | ObjectLiteral | ObjectLiteral[], parameters?: ObjectLiteral): this {
		this.qb.andWhere(where, parameters);
		return this;
	}

	/**
	 * Adds new OR WHERE condition in the query builder.
	 * Additionally you can add parameters used in where expression.
	 */
	@bindThis
	public orWhere(where: string | ((qb: UpdateQueryBuilder<T>) => string) | Brackets | ObjectLiteral | ObjectLiteral[], parameters?: ObjectLiteral): this {
		this.qb.orWhere(where, parameters);
		return this;
	}

	/**
	 * Updates a single property
	 * @param property Name of the property to update
	 * @param update Expression or SQL to apply
	 */
	@bindThis
	public set<P extends keyof T>(property: P, update: Update<T, P>): this {
		this.updates[property] = update;
		return this;
	}

	/**
	 * Updates a single property with a SQL expression
	 * @param property Name of the property to update
	 * @param sql SQL expression
	 * @param parameters Optional parameters for the expression
	 */
	@bindThis
	public setSql<P extends keyof T>(property: P, sql: string, parameters?: ObjectLiteral): this {
		this.updates[property] = { sql, parameters };
		return this;
	}

	/**
	 * Updates a single property with an inline value.
	 * @param property Name of the property to update
	 * @param value Value to set
	 */
	@bindThis
	public setValue<P extends keyof T>(property: P, value: T[P]): this {
		this.updates[property] = { value };
		return this;
	}

	/**
	 * Updates multiple properties.
	 * @param updates Hash of property names to expression or SQL updates.
	 */
	@bindThis
	public setMany(updates: Partial<UpdateHash<T>>): this {
		Object.assign(this.updates, updates);
		return this;
	}

	/**
	 * Executes all queued updates, if any.
	 * @returns the number of rows updated, or zero if no updates were queued.
	 */
	@bindThis
	public async execute(): Promise<number> {
		// Consolidate queued updates
		const updates: PartialEntityUpdate<T> = {};
		const parameters: ObjectLiteral = {};
		for (const e of Object.entries(this.updates)) {
			const key = e[0] as keyof T;
			const update = e[1] as Update<T, keyof T> | undefined;

			if (update) {
				if ('sql' in update) {
					updates[key] = () => update.sql;
					if (update.parameters) {
						Object.assign(parameters, update.parameters);
					}
				} else {
					updates[key] = update.value;
				}
			}
		}

		// Skip the whole query if it would be a no-op - otherwise we'll get an error.
		if (Object.keys(updates).length < 1) {
			return 0;
		}

		// Do it!
		const results = await this.qb
			.setParameters(parameters)
			.set(updates)
			.execute();
		return results.affected ?? 0;
	}
}

type UpdateHash<T> = {
	[K in keyof T]?: Update<T, K>;
};

type Update<T, K extends keyof T> =
	ValueUpdate<T, K> |
	SqlUpdate;

type ValueUpdate<T, K extends keyof T> = { value: T[K] };
type SqlUpdate = { sql: string, parameters?: ObjectLiteral };
