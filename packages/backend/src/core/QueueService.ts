/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { MetricsTime, type JobType } from 'bullmq';
import { parse as parseRedisInfo } from 'redis-info';
import type { IActivity } from '@/core/activitypub/type.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiWebhook, WebhookEventTypes } from '@/models/Webhook.js';
import type { MiSystemWebhook, SystemWebhookEventType } from '@/models/SystemWebhook.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { Antenna } from '@/server/api/endpoints/i/import-antennas.js';
import { ApRequestCreator } from '@/core/activitypub/ApRequestService.js';
import { TimeService } from '@/global/TimeService.js';
import type { SystemWebhookPayload } from '@/core/SystemWebhookService.js';
import type { MiNote } from '@/models/Note.js';
import type { MinimalNote } from '@/misc/is-renote.js';
import { type UserWebhookPayload } from './UserWebhookService.js';
import type {
	BackgroundTaskJobData,
	DbJobData,
	DeliverJobData,
	RelationshipJobData,
	SystemWebhookDeliverJobData,
	ThinUser,
	UserWebhookDeliverJobData,
} from '../queue/types.js';
import type {
	DbQueue,
	DeliverQueue,
	EndedPollNotificationQueue,
	InboxQueue,
	ObjectStorageQueue,
	RelationshipQueue,
	SystemQueue,
	SystemWebhookDeliverQueue,
	UserWebhookDeliverQueue,
	ScheduleNotePostQueue,
	BackgroundTaskQueue,
} from './QueueModule.js';
import type httpSignature from '@peertube/http-signature';
import type * as Bull from 'bullmq';

export const QUEUE_TYPES = [
	'system',
	'endedPollNotification',
	'deliver',
	'inbox',
	'db',
	'relationship',
	'objectStorage',
	'userWebhookDeliver',
	'systemWebhookDeliver',
	'scheduleNotePost',
	'backgroundTask',
] as const;

@Injectable()
export class QueueService implements OnModuleInit {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject('queue:system') public systemQueue: SystemQueue,
		@Inject('queue:endedPollNotification') public endedPollNotificationQueue: EndedPollNotificationQueue,
		@Inject('queue:deliver') public deliverQueue: DeliverQueue,
		@Inject('queue:inbox') public inboxQueue: InboxQueue,
		@Inject('queue:db') public dbQueue: DbQueue,
		@Inject('queue:relationship') public relationshipQueue: RelationshipQueue,
		@Inject('queue:objectStorage') public objectStorageQueue: ObjectStorageQueue,
		@Inject('queue:userWebhookDeliver') public userWebhookDeliverQueue: UserWebhookDeliverQueue,
		@Inject('queue:systemWebhookDeliver') public systemWebhookDeliverQueue: SystemWebhookDeliverQueue,
		@Inject('queue:scheduleNotePost') public ScheduleNotePostQueue: ScheduleNotePostQueue,
		@Inject('queue:backgroundTask') public readonly backgroundTaskQueue: BackgroundTaskQueue,

		private readonly timeService: TimeService,
	) {}

	@bindThis
	public async onModuleInit() {
		await this.systemQueue.upsertJobScheduler(
			'tickCharts-scheduler',
			{ pattern: '0 * * * *' }, // every hour at :00
			{
				name: 'tickCharts',
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'resyncCharts-scheduler',
			{ pattern: '20 0 * * *' }, // every day at 00:20 (wait for tickCharts)
			{
				name: 'resyncCharts',
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'cleanCharts-scheduler',
			{ pattern: '40 0 * * *' }, // every day at 00:40 (wait for resyncCharts)
			{
				name: 'cleanCharts',
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'aggregateRetention-scheduler',
			{ pattern: '0 1 * * *' }, // every day at 01:00
			{
				name: 'aggregateRetention',
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'clean-scheduler',
			{ pattern: '10 1 * * *' }, // every day at 01:10 (wait for aggregateRetention)
			{
				name: 'clean',
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'checkExpiredMutings-scheduler',
			{ pattern: '*/5 * * * *' }, // every 5 minutes
			{
				name: 'checkExpiredMutings',
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'bakeBufferedReactions-scheduler',
			{ pattern: '20 1 * * *' }, // every day at 01:40 (wait for clean)
			{
				name: 'bakeBufferedReactions',
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'checkModeratorsActivity-scheduler',
			// 毎時30分に起動
			{ pattern: '30 * * * *' }, // every hour at :30
			{
				name: 'checkModeratorsActivity',
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'cleanupApLogs-scheduler',
			{ pattern: '*/10 * * *' }, // every 10 minutes
			{
				name: 'cleanupApLogs',
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		await this.systemQueue.upsertJobScheduler(
			'hibernateUsers-scheduler',
			{ pattern: '30 1 * * *' }, // every day at 01:30 (avoid bakeBufferedReactions)
			{
				name: 'hibernateUsers',
				opts: {
					removeOnComplete: 10,
					removeOnFail: 30,
				},
			});

		// Slot '40 1 * * *' is available for future work
		// Slot '50 1 * * *' is available for future work
	}

	@bindThis
	public deliver(user: ThinUser, content: IActivity | null, to: string | null, isSharedInbox: boolean) {
		if (content == null) return null;
		if (to == null) return null;

		const contentBody = JSON.stringify(content);
		const digest = ApRequestCreator.createDigest(contentBody);

		const data: DeliverJobData = {
			user: {
				id: user.id,
			},
			content: contentBody,
			digest,
			to,
			isSharedInbox,
		};

		const label = to.replace('https://', '').replace('/inbox', '');

		return this.deliverQueue.add(label, data, {
			attempts: this.config.deliverJobMaxAttempts ?? 12,
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	/**
	 * ApDeliverManager-DeliverManager.execute()からinboxesを突っ込んでaddBulkしたい
	 * @param user `{ id: string; }` この関数ではThinUserに変換しないので前もって変換してください
	 * @param content IActivity | null
	 * @param inboxes `Map<string, boolean>` / key: to (inbox url), value: isSharedInbox (whether it is sharedInbox)
	 * @returns void
	 */
	@bindThis
	public async deliverMany(user: ThinUser, content: IActivity | null, inboxes: Map<string, boolean>) {
		if (content == null) return null;
		const contentBody = JSON.stringify(content);
		const digest = ApRequestCreator.createDigest(contentBody);

		const opts = {
			attempts: this.config.deliverJobMaxAttempts ?? 12,
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		};

		await this.deliverQueue.addBulk(Array.from(inboxes.entries(), d => ({
			name: d[0].replace('https://', '').replace('/inbox', ''),
			data: {
				user,
				content: contentBody,
				digest,
				to: d[0],
				isSharedInbox: d[1],
			} as DeliverJobData,
			opts,
		})));

		return;
	}

	@bindThis
	public inbox(activity: IActivity, signature: httpSignature.IParsedSignature) {
		const data = {
			activity: activity,
			signature,
		};

		const label = (activity.id ?? '').replace('https://', '').replace('/activity', '');

		return this.inboxQueue.add(label, data, {
			attempts: this.config.inboxJobMaxAttempts ?? 8,
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: activity.id ? {
				id: activity.id,
			} : undefined,
		});
	}

	@bindThis
	public createDeleteDriveFilesJob(user: ThinUser) {
		return this.dbQueue.add('deleteDriveFiles', {
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: user.id,
			},
		});
	}

	@bindThis
	public createExportCustomEmojisJob(user: ThinUser) {
		return this.dbQueue.add('exportCustomEmojis', {
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: user.id,
			},
		});
	}

	@bindThis
	public createExportAccountDataJob(user: ThinUser) {
		return this.dbQueue.add('exportAccountData', {
			user: { id: user.id },
		}, {
			removeOnComplete: true,
			removeOnFail: true,
			deduplication: {
				id: user.id,
			},
		});
	}

	@bindThis
	public createExportNotesJob(user: ThinUser) {
		return this.dbQueue.add('exportNotes', {
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: user.id,
			},
		});
	}

	@bindThis
	public createExportClipsJob(user: ThinUser) {
		return this.dbQueue.add('exportClips', {
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: user.id,
			},
		});
	}

	@bindThis
	public createExportFavoritesJob(user: ThinUser) {
		return this.dbQueue.add('exportFavorites', {
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: user.id,
			},
		});
	}

	@bindThis
	public createExportFollowingJob(user: ThinUser, excludeMuting = false, excludeInactive = false) {
		return this.dbQueue.add('exportFollowing', {
			user: { id: user.id },
			excludeMuting,
			excludeInactive,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: user.id,
			},
		});
	}

	@bindThis
	public createExportMuteJob(user: ThinUser) {
		return this.dbQueue.add('exportMuting', {
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: user.id,
			},
		});
	}

	@bindThis
	public createExportBlockingJob(user: ThinUser) {
		return this.dbQueue.add('exportBlocking', {
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: user.id,
			},
		});
	}

	@bindThis
	public createExportUserListsJob(user: ThinUser) {
		return this.dbQueue.add('exportUserLists', {
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: user.id,
			},
		});
	}

	@bindThis
	public createExportAntennasJob(user: ThinUser) {
		return this.dbQueue.add('exportAntennas', {
			user: { id: user.id },
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: user.id,
			},
		});
	}

	@bindThis
	public createImportFollowingJob(user: ThinUser, fileId: MiDriveFile['id'], withReplies?: boolean) {
		return this.dbQueue.add('importFollowing', {
			user: { id: user.id },
			fileId: fileId,
			withReplies,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `${user.id}_${fileId}_${withReplies ?? false}`,
			},
		});
	}

	@bindThis
	public createImportNotesJob(user: ThinUser, fileId: MiDriveFile['id'], type: string | null | undefined) {
		return this.dbQueue.add('importNotes', {
			user: { id: user.id },
			fileId: fileId,
			type: type,
		}, {
			removeOnComplete: true,
			removeOnFail: true,
			deduplication: {
				id: `${user.id}_${fileId}_${type ?? null}`,
			},
		});
	}

	@bindThis
	public createImportTweetsToDbJob(user: ThinUser, targets: string[], note: MiNote['id'] | null) {
		const jobs = targets.map(rel => this.generateToDbJobData('importTweetsToDb', { user, target: rel, note }));
		return this.dbQueue.addBulk(jobs);
	}

	@bindThis
	public createImportMastoToDbJob(user: ThinUser, targets: string[], note: MiNote['id'] | null) {
		const jobs = targets.map(rel => this.generateToDbJobData('importMastoToDb', { user, target: rel, note }));
		return this.dbQueue.addBulk(jobs);
	}

	@bindThis
	public createImportPleroToDbJob(user: ThinUser, targets: string[], note: MiNote['id'] | null) {
		const jobs = targets.map(rel => this.generateToDbJobData('importPleroToDb', { user, target: rel, note }));
		return this.dbQueue.addBulk(jobs);
	}

	@bindThis
	public createImportKeyNotesToDbJob(user: ThinUser, targets: string[], note: MiNote['id'] | null) {
		const jobs = targets.map(rel => this.generateToDbJobData('importKeyNotesToDb', { user, target: rel, note }));
		return this.dbQueue.addBulk(jobs);
	}

	@bindThis
	public createImportIGToDbJob(user: ThinUser, targets: string[]) {
		const jobs = targets.map(rel => this.generateToDbJobData('importIGToDb', { user, target: rel }));
		return this.dbQueue.addBulk(jobs);
	}

	@bindThis
	public createImportFBToDbJob(user: ThinUser, targets: string[]) {
		const jobs = targets.map(rel => this.generateToDbJobData('importFBToDb', { user, target: rel }));
		return this.dbQueue.addBulk(jobs);
	}

	@bindThis
	public createImportFollowingToDbJob(user: ThinUser, targets: string[], withReplies?: boolean) {
		const jobs = targets.map(rel => this.generateToDbJobData('importFollowingToDb', { user, target: rel, withReplies }));
		return this.dbQueue.addBulk(jobs);
	}

	@bindThis
	public createImportMutingJob(user: ThinUser, fileId: MiDriveFile['id']) {
		return this.dbQueue.add('importMuting', {
			user: { id: user.id },
			fileId: fileId,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `${user.id}_${fileId}`,
			},
		});
	}

	@bindThis
	public createImportBlockingJob(user: ThinUser, fileId: MiDriveFile['id']) {
		return this.dbQueue.add('importBlocking', {
			user: { id: user.id },
			fileId: fileId,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `${user.id}_${fileId}`,
			},
		});
	}

	@bindThis
	public createImportBlockingToDbJob(user: ThinUser, targets: string[]) {
		const jobs = targets.map(rel => this.generateToDbJobData('importBlockingToDb', { user, target: rel }));
		return this.dbQueue.addBulk(jobs);
	}

	@bindThis
	private generateToDbJobData<T extends 'importFollowingToDb' | 'importBlockingToDb' | 'importTweetsToDb' | 'importIGToDb' | 'importFBToDb' | 'importMastoToDb' | 'importPleroToDb' | 'importKeyNotesToDb', D extends DbJobData<T>>(name: T, data: D): {
		name: string,
		data: D,
		opts: Bull.JobsOptions,
	} {
		return {
			name,
			data,
			opts: {
				removeOnComplete: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 30,
				},
				removeOnFail: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 100,
				},
			},
		};
	}

	@bindThis
	public createImportUserListsJob(user: ThinUser, fileId: MiDriveFile['id']) {
		return this.dbQueue.add('importUserLists', {
			user: { id: user.id },
			fileId: fileId,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `${user.id}_${fileId}`,
			},
		});
	}

	@bindThis
	public createImportCustomEmojisJob(user: ThinUser, fileId: MiDriveFile['id']) {
		return this.dbQueue.add('importCustomEmojis', {
			user: { id: user.id },
			fileId: fileId,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `${user.id}_${fileId}`,
			},
		});
	}

	@bindThis
	public createImportAntennasJob(user: ThinUser, antenna: Antenna, fileId: MiDriveFile['id']) {
		return this.dbQueue.add('importAntennas', {
			user: { id: user.id },
			antenna,
			fileId,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `${user.id}_${fileId}`,
			},
		});
	}

	@bindThis
	public createDeleteAccountJob(user: ThinUser, opts: { soft?: boolean; } = {}) {
		return this.dbQueue.add('deleteAccount', {
			user: { id: user.id },
			soft: opts.soft,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: user.id,
			},
		});
	}

	@bindThis
	public createFollowJob(followings: { from: ThinUser, to: ThinUser, requestId?: string, silent?: boolean, withReplies?: boolean }[]) {
		const jobs = followings.map(rel => this.generateRelationshipJobData('follow', rel));
		return this.relationshipQueue.addBulk(jobs);
	}

	@bindThis
	public createUnfollowJob(followings: { from: ThinUser, to: ThinUser, requestId?: string }[]) {
		const jobs = followings.map(rel => this.generateRelationshipJobData('unfollow', rel));
		return this.relationshipQueue.addBulk(jobs);
	}

	@bindThis
	public createDelayedUnfollowJob(followings: { from: ThinUser, to: ThinUser, requestId?: string }[], delay: number) {
		const jobs = followings.map(rel => this.generateRelationshipJobData('unfollow', rel, { delay }));
		return this.relationshipQueue.addBulk(jobs);
	}

	@bindThis
	public createBlockJob(blockings: { from: ThinUser, to: ThinUser, silent?: boolean }[]) {
		const jobs = blockings.map(rel => this.generateRelationshipJobData('block', rel));
		return this.relationshipQueue.addBulk(jobs);
	}

	@bindThis
	public createUnblockJob(blockings: { from: ThinUser, to: ThinUser, silent?: boolean }[]) {
		const jobs = blockings.map(rel => this.generateRelationshipJobData('unblock', rel));
		return this.relationshipQueue.addBulk(jobs);
	}

	@bindThis
	public createMoveJob(from: ThinUser, to: ThinUser) {
		const job = this.generateRelationshipJobData('move', { from, to });
		return this.relationshipQueue.add(job.name, job.data, job.opts);
	}

	@bindThis
	private generateRelationshipJobData(name: 'follow' | 'unfollow' | 'block' | 'unblock' | 'move', data: RelationshipJobData, opts: Bull.JobsOptions = {}): {
		name: string,
		data: RelationshipJobData,
		opts: Bull.JobsOptions,
	} {
		return {
			name,
			data: {
				from: { id: data.from.id },
				to: { id: data.to.id },
				silent: data.silent,
				requestId: data.requestId,
				withReplies: data.withReplies,
			},
			opts: {
				removeOnComplete: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 30,
				},
				removeOnFail: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 100,
				},
				...opts,
				deduplication: {
					id: `${data.from.id}_${data.to.id}_${data.requestId ?? ''}_${data.silent ?? false}_${data.withReplies ?? false}`,
				},
			},
		};
	}

	@bindThis
	public createDeleteObjectStorageFileJob(key: string) {
		return this.objectStorageQueue.add('deleteFile', {
			key: key,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: key,
			},
		});
	}

	@bindThis
	public createCleanRemoteFilesJob(olderThanSeconds: number = 0, keepFilesInUse: boolean = false) {
		return this.objectStorageQueue.add('cleanRemoteFiles', {
			keepFilesInUse,
			olderThanSeconds,
		}, {
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
			deduplication: {
				id: `${olderThanSeconds}_${keepFilesInUse}`,
			},
		});
	}

	@bindThis
	public async createUpdateUserJob(userId: string) {
		return await this.createBackgroundTask({ type: 'update-user', userId }, userId);
	}

	@bindThis
	public async createUpdateFeaturedJob(userId: string) {
		return await this.createBackgroundTask({ type: 'update-featured', userId }, userId);
	}

	@bindThis
	public async createUpdateInstanceJob(host: string) {
		return await this.createBackgroundTask({ type: 'update-instance', host }, host);
	}

	@bindThis
	public async createPostDeliverJob(host: string, result: 'success' | 'temp-fail' | 'perm-fail') {
		return await this.createBackgroundTask({ type: 'post-deliver', host, result });
	}

	@bindThis
	public async createPostInboxJob(host: string) {
		return await this.createBackgroundTask({ type: 'post-inbox', host });
	}

	@bindThis
	public async createPostNoteJob(noteId: string, silent: boolean, type: 'create' | 'edit') {
		const edit = type === 'edit';
		const duplication = `${noteId}_${type}`;

		return await this.createBackgroundTask({ type: 'post-note', noteId, silent, edit }, duplication);
	}

	@bindThis
	public async createUpdateUserTagsJob(userId: string) {
		return await this.createBackgroundTask({ type: 'update-user-tags', userId }, userId);
	}

	@bindThis
	public async createUpdateNoteTagsJob(noteId: string) {
		return await this.createBackgroundTask({ type: 'update-note-tags', noteId }, noteId);
	}

	@bindThis
	public async createDeleteFileJob(fileId: string, isExpired?: boolean, deleterId?: string) {
		return await this.createBackgroundTask({ type: 'delete-file', fileId, isExpired, deleterId }, fileId);
	}

	@bindThis
	public async createUpdateLatestNoteJob(note: MinimalNote) {
		// Compact the note to avoid storing the entire thing in Redis, when all we need is minimal data for categorization
		const minimizedNote: MinimalNote = {
			id: note.id,
			visibility: note.visibility,
			userId: note.userId,
			replyId: note.replyId,
			renoteId: note.renoteId,
			hasPoll: note.hasPoll,
			text: note.text ? '1' : null,
			cw: note.text ? '1' : null,
			fileIds: note.fileIds.length > 0 ? ['1'] : [],
		};

		return await this.createBackgroundTask({ type: 'update-latest-note', note: minimizedNote }, note.id);
	}

	@bindThis
	public async createPostSuspendJob(userId: string) {
		return await this.createBackgroundTask({ type: 'post-suspend', userId }, userId);
	}

	@bindThis
	public async createPostUnsuspendJob(userId: string) {
		return await this.createBackgroundTask({ type: 'post-unsuspend', userId }, userId);
	}

	@bindThis
	public async createDeleteApLogsJob(dataType: 'inbox' | 'object', data: string | string[]) {
		return await this.createBackgroundTask({ type: 'delete-ap-logs', dataType, data });
	}

	private async createBackgroundTask<T extends BackgroundTaskJobData>(data: T, duplication?: string | { id: string, ttl?: number }) {
		return await this.backgroundTaskQueue.add(
			data.type,
			data,
			{
				// https://docs.bullmq.io/guide/retrying-failing-jobs#custom-back-off-strategies
				attempts: this.config.backgroundJobMaxAttempts ?? 8,
				backoff: {
					// Resolves to QueueProcessorService::HttpRelatedBackoff()
					type: 'custom',
				},

				// https://docs.bullmq.io/guide/jobs/deduplication
				deduplication: typeof(duplication) === 'string'
					? { id: `${data.type}_${duplication}` }
					: duplication,
			},
		);
	};

	/**
	 * @see UserWebhookDeliverJobData
	 * @see UserWebhookDeliverProcessorService
	 */
	@bindThis
	public userWebhookDeliver<T extends WebhookEventTypes>(
		webhook: MiWebhook,
		type: T,
		content: UserWebhookPayload<T>,
		opts?: { attempts?: number },
	) {
		const data: UserWebhookDeliverJobData = {
			type,
			content,
			webhookId: webhook.id,
			userId: webhook.userId,
			to: webhook.url,
			secret: webhook.secret,
			createdAt: this.timeService.now,
			eventId: randomUUID(),
		};

		return this.userWebhookDeliverQueue.add(webhook.id, data, {
			attempts: opts?.attempts ?? 4,
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	/**
	 * @see SystemWebhookDeliverJobData
	 * @see SystemWebhookDeliverProcessorService
	 */
	@bindThis
	public systemWebhookDeliver<T extends SystemWebhookEventType>(
		webhook: MiSystemWebhook,
		type: T,
		content: SystemWebhookPayload<T>,
		opts?: { attempts?: number },
	) {
		const data: SystemWebhookDeliverJobData = {
			type,
			content,
			webhookId: webhook.id,
			to: webhook.url,
			secret: webhook.secret,
			createdAt: this.timeService.now,
			eventId: randomUUID(),
		};

		return this.systemWebhookDeliverQueue.add(webhook.id, data, {
			attempts: opts?.attempts ?? 4,
			backoff: {
				type: 'custom',
			},
			removeOnComplete: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7, // keep up to 7 days
				count: 100,
			},
		});
	}

	@bindThis
	private getQueue(type: typeof QUEUE_TYPES[number]): Bull.Queue {
		switch (type) {
			case 'system': return this.systemQueue;
			case 'endedPollNotification': return this.endedPollNotificationQueue;
			case 'deliver': return this.deliverQueue;
			case 'inbox': return this.inboxQueue;
			case 'db': return this.dbQueue;
			case 'relationship': return this.relationshipQueue;
			case 'objectStorage': return this.objectStorageQueue;
			case 'userWebhookDeliver': return this.userWebhookDeliverQueue;
			case 'systemWebhookDeliver': return this.systemWebhookDeliverQueue;
			case 'scheduleNotePost': return this.ScheduleNotePostQueue;
			case 'backgroundTask': return this.backgroundTaskQueue;
			default: throw new Error(`Unrecognized queue type: ${type}`);
		}
	}

	@bindThis
	public async queueClear(queueType: typeof QUEUE_TYPES[number], state: '*' | 'completed' | 'wait' | 'active' | 'paused' | 'prioritized' | 'delayed' | 'failed') {
		const queue = this.getQueue(queueType);

		if (state === '*') {
			await Promise.all([
				queue.clean(0, 0, 'completed'),
				queue.clean(0, 0, 'wait'),
				queue.clean(0, 0, 'active'),
				queue.clean(0, 0, 'paused'),
				queue.clean(0, 0, 'prioritized'),
				queue.clean(0, 0, 'delayed'),
				queue.clean(0, 0, 'failed'),
			]);
		} else {
			await queue.clean(0, 0, state);
		}
	}

	@bindThis
	public async queuePromoteJobs(queueType: typeof QUEUE_TYPES[number]) {
		const queue = this.getQueue(queueType);
		await queue.promoteJobs();
	}

	@bindThis
	public async queueRetryJob(queueType: typeof QUEUE_TYPES[number], jobId: string) {
		const queue = this.getQueue(queueType);
		const job: Bull.Job | undefined = await queue.getJob(jobId);
		if (job) {
			if (job.finishedOn != null) {
				await job.retry();
			} else {
				await job.promote();
			}
		}
	}

	@bindThis
	public async queueRemoveJob(queueType: typeof QUEUE_TYPES[number], jobId: string) {
		const queue = this.getQueue(queueType);
		const job: Bull.Job | undefined = await queue.getJob(jobId);
		if (job) {
			await job.remove();
		}
	}

	@bindThis
	private packJobData(job: Bull.Job) {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		const stacktrace = job.stacktrace ? job.stacktrace.filter(Boolean) : [];
		stacktrace.reverse();

		return {
			id: job.id,
			name: job.name,
			data: job.data,
			opts: job.opts,
			timestamp: job.timestamp,
			processedOn: job.processedOn,
			processedBy: job.processedBy,
			finishedOn: job.finishedOn,
			progress: job.progress,
			attempts: job.attemptsMade,
			delay: job.delay,
			failedReason: job.failedReason,
			stacktrace: stacktrace,
			returnValue: job.returnvalue,
			isFailed: !!job.failedReason || (Array.isArray(stacktrace) && stacktrace.length > 0),
		};
	}

	@bindThis
	public async queueGetJob(queueType: typeof QUEUE_TYPES[number], jobId: string) {
		const queue = this.getQueue(queueType);
		const job: Bull.Job | undefined = await queue.getJob(jobId);
		if (job) {
			return this.packJobData(job);
		} else {
			throw new Error(`Job not found: ${jobId}`);
		}
	}

	@bindThis
	public async queueGetJobs(queueType: typeof QUEUE_TYPES[number], jobTypes: JobType[], search?: string) {
		const RETURN_LIMIT = 100;
		const queue = this.getQueue(queueType);
		let jobs: (Bull.Job | null)[];

		if (search) {
			jobs = await queue.getJobs(jobTypes, 0, 1000);

			jobs = jobs.filter(job => {
				const jobString = JSON.stringify(job).toLowerCase();
				return search.toLowerCase().split(' ').every(term => {
					return jobString.includes(term);
				});
			});

			jobs = jobs.slice(0, RETURN_LIMIT);
		} else {
			jobs = await queue.getJobs(jobTypes, 0, RETURN_LIMIT);
		}

		return jobs
			.filter(job => job != null) // not sure how this happens, but it does
			.map(job => this.packJobData(job));
	}

	@bindThis
	public async queueGetQueues() {
		const fetchings = QUEUE_TYPES.map(async type => {
			const queue = this.getQueue(type);

			const counts = await queue.getJobCounts();
			const isPaused = await queue.isPaused();
			const metrics_completed = await queue.getMetrics('completed', 0, MetricsTime.ONE_WEEK);
			const metrics_failed = await queue.getMetrics('failed', 0, MetricsTime.ONE_WEEK);

			return {
				name: type,
				counts: counts,
				isPaused,
				metrics: {
					completed: metrics_completed,
					failed: metrics_failed,
				},
			};
		});

		return await Promise.all(fetchings);
	}

	@bindThis
	public async queueGetQueue(queueType: typeof QUEUE_TYPES[number]) {
		const queue = this.getQueue(queueType);
		const counts = await queue.getJobCounts();
		const isPaused = await queue.isPaused();
		const metrics_completed = await queue.getMetrics('completed', 0, MetricsTime.ONE_WEEK);
		const metrics_failed = await queue.getMetrics('failed', 0, MetricsTime.ONE_WEEK);
		const db = parseRedisInfo(await (await queue.client).info());

		return {
			name: queueType,
			qualifiedName: queue.qualifiedName,
			counts: counts,
			isPaused,
			metrics: {
				completed: metrics_completed,
				failed: metrics_failed,
			},
			db: {
				version: db.redis_version,
				mode: db.redis_mode,
				runId: db.run_id,
				processId: db.process_id,
				port: parseInt(db.tcp_port),
				os: db.os,
				uptime: parseInt(db.uptime_in_seconds),
				memory: {
					total: parseInt(db.total_system_memory) || parseInt(db.maxmemory),
					used: parseInt(db.used_memory),
					fragmentationRatio: parseInt(db.mem_fragmentation_ratio),
					peak: parseInt(db.used_memory_peak),
				},
				clients: {
					connected: parseInt(db.connected_clients),
					blocked: parseInt(db.blocked_clients),
				},
			},
		};
	}
}
