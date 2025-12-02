/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import * as Bull from 'bullmq';
import * as Sentry from '@sentry/node';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { CheckModeratorsActivityProcessorService } from '@/queue/processors/CheckModeratorsActivityProcessorService.js';
import { TimeService } from '@/global/TimeService.js';
import { renderFullError } from '@/misc/render-full-error.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { isRetryableError } from '@/misc/is-retryable-error.js';
import { UserWebhookDeliverProcessorService } from './processors/UserWebhookDeliverProcessorService.js';
import { SystemWebhookDeliverProcessorService } from './processors/SystemWebhookDeliverProcessorService.js';
import { EndedPollNotificationProcessorService } from './processors/EndedPollNotificationProcessorService.js';
import { DeliverProcessorService } from './processors/DeliverProcessorService.js';
import { InboxProcessorService } from './processors/InboxProcessorService.js';
import { DeleteDriveFilesProcessorService } from './processors/DeleteDriveFilesProcessorService.js';
import { ExportAccountDataProcessorService } from './processors/ExportAccountDataProcessorService.js';
import { ExportCustomEmojisProcessorService } from './processors/ExportCustomEmojisProcessorService.js';
import { ExportNotesProcessorService } from './processors/ExportNotesProcessorService.js';
import { ExportClipsProcessorService } from './processors/ExportClipsProcessorService.js';
import { ExportFollowingProcessorService } from './processors/ExportFollowingProcessorService.js';
import { ExportMutingProcessorService } from './processors/ExportMutingProcessorService.js';
import { ExportBlockingProcessorService } from './processors/ExportBlockingProcessorService.js';
import { ExportUserListsProcessorService } from './processors/ExportUserListsProcessorService.js';
import { ExportAntennasProcessorService } from './processors/ExportAntennasProcessorService.js';
import { ImportFollowingProcessorService } from './processors/ImportFollowingProcessorService.js';
import { ImportMutingProcessorService } from './processors/ImportMutingProcessorService.js';
import { ImportBlockingProcessorService } from './processors/ImportBlockingProcessorService.js';
import { ImportUserListsProcessorService } from './processors/ImportUserListsProcessorService.js';
import { ImportCustomEmojisProcessorService } from './processors/ImportCustomEmojisProcessorService.js';
import { ImportAntennasProcessorService } from './processors/ImportAntennasProcessorService.js';
import { DeleteAccountProcessorService } from './processors/DeleteAccountProcessorService.js';
import { ExportFavoritesProcessorService } from './processors/ExportFavoritesProcessorService.js';
import { CleanRemoteFilesProcessorService } from './processors/CleanRemoteFilesProcessorService.js';
import { DeleteFileProcessorService } from './processors/DeleteFileProcessorService.js';
import { RelationshipProcessorService } from './processors/RelationshipProcessorService.js';
import { TickChartsProcessorService } from './processors/TickChartsProcessorService.js';
import { ResyncChartsProcessorService } from './processors/ResyncChartsProcessorService.js';
import { CleanChartsProcessorService } from './processors/CleanChartsProcessorService.js';
import { CheckExpiredMutingsProcessorService } from './processors/CheckExpiredMutingsProcessorService.js';
import { BakeBufferedReactionsProcessorService } from './processors/BakeBufferedReactionsProcessorService.js';
import { CleanProcessorService } from './processors/CleanProcessorService.js';
import { AggregateRetentionProcessorService } from './processors/AggregateRetentionProcessorService.js';
import { ScheduleNotePostProcessorService } from './processors/ScheduleNotePostProcessorService.js';
import { QueueLoggerService } from './QueueLoggerService.js';
import { QUEUE, baseWorkerOptions } from './const.js';
import { ImportNotesProcessorService } from './processors/ImportNotesProcessorService.js';
import { CleanupApLogsProcessorService } from './processors/CleanupApLogsProcessorService.js';
import { HibernateUsersProcessorService } from './processors/HibernateUsersProcessorService.js';
import { BackgroundTaskProcessorService } from './processors/BackgroundTaskProcessorService.js';

// ref. https://github.com/misskey-dev/misskey/pull/7635#issue-971097019
function httpRelatedBackoff(attemptsMade: number, type?: string, error?: Error) {
	// Don't retry permanent errors
	// https://docs.bullmq.io/guide/retrying-failing-jobs#custom-back-off-strategies
	if (error && !isRetryableError(error)) {
		return -1;
	}

	const baseDelay = 60 * 1000;	// 1min
	const maxBackoff = 8 * 60 * 60 * 1000;	// 8hours
	let backoff = (Math.pow(2, attemptsMade) - 1) * baseDelay;
	backoff = Math.min(backoff, maxBackoff);
	backoff += Math.round(backoff * Math.random() * 0.2);
	return backoff;
}

function _getJobInfo(now: number, job: Bull.Job | undefined, increment = false): string {
	if (job == null) return '-';

	const age = now - job.timestamp;

	const formated = age > 60000 ? `${Math.floor(age / 1000 / 60)}m`
		: age > 10000 ? `${Math.floor(age / 1000)}s`
		: `${age}ms`;

	// onActiveとかonCompletedのattemptsMadeがなぜか0始まりなのでインクリメントする
	const currentAttempts = job.attemptsMade + (increment ? 1 : 0);
	const maxAttempts = job.opts.attempts ?? 0;

	return job.name
		? `id=${job.id} attempts=${currentAttempts}/${maxAttempts} age=${formated} name=${job.name}`
		: `id=${job.id} attempts=${currentAttempts}/${maxAttempts} age=${formated}`;
}

@Injectable()
export class QueueProcessorService implements OnApplicationShutdown {
	private logger: Logger;
	private systemQueueWorker: Bull.Worker;
	private dbQueueWorker: Bull.Worker;
	private deliverQueueWorker: Bull.Worker;
	private inboxQueueWorker: Bull.Worker;
	private userWebhookDeliverQueueWorker: Bull.Worker;
	private systemWebhookDeliverQueueWorker: Bull.Worker;
	private relationshipQueueWorker: Bull.Worker;
	private objectStorageQueueWorker: Bull.Worker;
	private endedPollNotificationQueueWorker: Bull.Worker;
	private schedulerNotePostQueueWorker: Bull.Worker;
	private readonly backgroundTaskWorker: Bull.Worker;

	constructor(
		@Inject(DI.config)
		private config: Config,

		private queueLoggerService: QueueLoggerService,
		private userWebhookDeliverProcessorService: UserWebhookDeliverProcessorService,
		private systemWebhookDeliverProcessorService: SystemWebhookDeliverProcessorService,
		private endedPollNotificationProcessorService: EndedPollNotificationProcessorService,
		private deliverProcessorService: DeliverProcessorService,
		private inboxProcessorService: InboxProcessorService,
		private deleteDriveFilesProcessorService: DeleteDriveFilesProcessorService,
		private exportAccountDataProcessorService: ExportAccountDataProcessorService,
		private exportCustomEmojisProcessorService: ExportCustomEmojisProcessorService,
		private exportNotesProcessorService: ExportNotesProcessorService,
		private exportClipsProcessorService: ExportClipsProcessorService,
		private exportFavoritesProcessorService: ExportFavoritesProcessorService,
		private exportFollowingProcessorService: ExportFollowingProcessorService,
		private exportMutingProcessorService: ExportMutingProcessorService,
		private exportBlockingProcessorService: ExportBlockingProcessorService,
		private exportUserListsProcessorService: ExportUserListsProcessorService,
		private exportAntennasProcessorService: ExportAntennasProcessorService,
		private importFollowingProcessorService: ImportFollowingProcessorService,
		private importNotesProcessorService: ImportNotesProcessorService,
		private importMutingProcessorService: ImportMutingProcessorService,
		private importBlockingProcessorService: ImportBlockingProcessorService,
		private importUserListsProcessorService: ImportUserListsProcessorService,
		private importCustomEmojisProcessorService: ImportCustomEmojisProcessorService,
		private importAntennasProcessorService: ImportAntennasProcessorService,
		private deleteAccountProcessorService: DeleteAccountProcessorService,
		private deleteFileProcessorService: DeleteFileProcessorService,
		private cleanRemoteFilesProcessorService: CleanRemoteFilesProcessorService,
		private relationshipProcessorService: RelationshipProcessorService,
		private tickChartsProcessorService: TickChartsProcessorService,
		private resyncChartsProcessorService: ResyncChartsProcessorService,
		private cleanChartsProcessorService: CleanChartsProcessorService,
		private aggregateRetentionProcessorService: AggregateRetentionProcessorService,
		private checkExpiredMutingsProcessorService: CheckExpiredMutingsProcessorService,
		private bakeBufferedReactionsProcessorService: BakeBufferedReactionsProcessorService,
		private checkModeratorsActivityProcessorService: CheckModeratorsActivityProcessorService,
		private cleanProcessorService: CleanProcessorService,
		private scheduleNotePostProcessorService: ScheduleNotePostProcessorService,
		private readonly timeService: TimeService,
		private readonly cleanupApLogsProcessorService: CleanupApLogsProcessorService,
		private readonly hibernateUsersProcessorService: HibernateUsersProcessorService,
		private readonly backgroundTaskProcessorService: BackgroundTaskProcessorService,
	) {
		this.logger = this.queueLoggerService.logger;

		// This is just to avoid modifying all the existing code.
		const getJobInfo = (job: Bull.Job | undefined, increment = false) => {
			return _getJobInfo(this.timeService.now, job, increment);
		};

		//#region system
		{
			const processer = (job: Bull.Job) => {
				switch (job.name) {
					case 'tickCharts': return this.tickChartsProcessorService.process();
					case 'resyncCharts': return this.resyncChartsProcessorService.process();
					case 'cleanCharts': return this.cleanChartsProcessorService.process();
					case 'aggregateRetention': return this.aggregateRetentionProcessorService.process();
					case 'checkExpiredMutings': return this.checkExpiredMutingsProcessorService.process();
					case 'bakeBufferedReactions': return this.bakeBufferedReactionsProcessorService.process();
					case 'checkModeratorsActivity': return this.checkModeratorsActivityProcessorService.process();
					case 'clean': return this.cleanProcessorService.process();
					case 'cleanupApLogs': return this.cleanupApLogsProcessorService.process();
					case 'hibernateUsers': return this.hibernateUsersProcessorService.process();
					default: throw new Error(`unrecognized job type ${job.name} for system`);
				}
			};

			this.systemQueueWorker = new Bull.Worker(QUEUE.SYSTEM, (job) => {
				if (this.config.sentryForBackend) {
					return Sentry.startSpan({ name: 'Queue: System: ' + job.name }, () => processer(job));
				} else {
					return processer(job);
				}
			}, {
				...baseWorkerOptions(this.config, QUEUE.SYSTEM),
				autorun: false,
			});

			const logger = this.logger.createSubLogger('system');

			this.systemQueueWorker
				.on('active', (job) => logger.debug(`active id=${job.id}`))
				.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
				.on('failed', (job, err: Error) => {
					this.logError(logger, err, job);
					if (config.sentryForBackend) {
						Sentry.captureMessage(`Queue: System: ${job?.name ?? '?'}: ${err.name}: ${err.message}`, {
							level: 'error',
							extra: { job, err },
						});
					}
				})
				.on('error', (err: Error) => this.logError(logger, err))
				.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
		}
		//#endregion

		//#region db
		{
			const processer = (job: Bull.Job) => {
				switch (job.name) {
					case 'deleteDriveFiles': return this.deleteDriveFilesProcessorService.process(job);
					case 'exportCustomEmojis': return this.exportCustomEmojisProcessorService.process(job);
					case 'exportNotes': return this.exportNotesProcessorService.process(job);
					case 'exportClips': return this.exportClipsProcessorService.process(job);
					case 'exportFavorites': return this.exportFavoritesProcessorService.process(job);
					case 'exportFollowing': return this.exportFollowingProcessorService.process(job);
					case 'exportMuting': return this.exportMutingProcessorService.process(job);
					case 'exportBlocking': return this.exportBlockingProcessorService.process(job);
					case 'exportUserLists': return this.exportUserListsProcessorService.process(job);
					case 'exportAntennas': return this.exportAntennasProcessorService.process(job);
					case 'exportAccountData': return this.exportAccountDataProcessorService.process(job);
					case 'importFollowing': return this.importFollowingProcessorService.process(job);
					case 'importFollowingToDb': return this.importFollowingProcessorService.processDb(job);
					case 'importMuting': return this.importMutingProcessorService.process(job);
					case 'importBlocking': return this.importBlockingProcessorService.process(job);
					case 'importBlockingToDb': return this.importBlockingProcessorService.processDb(job);
					case 'importUserLists': return this.importUserListsProcessorService.process(job);
					case 'importCustomEmojis': return this.importCustomEmojisProcessorService.process(job);
					case 'importAntennas': return this.importAntennasProcessorService.process(job);
					case 'importNotes': return this.importNotesProcessorService.process(job);
					case 'importTweetsToDb': return this.importNotesProcessorService.processTwitterDb(job);
					case 'importIGToDb': return this.importNotesProcessorService.processIGDb(job);
					case 'importFBToDb': return this.importNotesProcessorService.processFBDb(job);
					case 'importMastoToDb': return this.importNotesProcessorService.processMastoToDb(job);
					case 'importPleroToDb': return this.importNotesProcessorService.processPleroToDb(job);
					case 'importKeyNotesToDb': return this.importNotesProcessorService.processKeyNotesToDb(job);
					case 'deleteAccount': return this.deleteAccountProcessorService.process(job);
					default: throw new Error(`unrecognized job type ${job.name} for db`);
				}
			};

			this.dbQueueWorker = new Bull.Worker(QUEUE.DB, (job) => {
				if (this.config.sentryForBackend) {
					return Sentry.startSpan({ name: 'Queue: DB: ' + job.name }, () => processer(job));
				} else {
					return processer(job);
				}
			}, {
				...baseWorkerOptions(this.config, QUEUE.DB),
				autorun: false,
			});

			const logger = this.logger.createSubLogger('db');

			this.dbQueueWorker
				.on('active', (job) => logger.debug(`active id=${job.id}`))
				.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
				.on('failed', (job, err) => {
					this.logError(logger, err, job);
					if (config.sentryForBackend) {
						Sentry.captureMessage(`Queue: DB: ${job?.name ?? '?'}: ${err.name}: ${err.message}`, {
							level: 'error',
							extra: { job, err },
						});
					}
				})
				.on('error', (err: Error) => this.logError(logger, err))
				.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
		}
		//#endregion

		//#region deliver
		{
			this.deliverQueueWorker = new Bull.Worker(QUEUE.DELIVER, (job) => {
				if (this.config.sentryForBackend) {
					return Sentry.startSpan({ name: 'Queue: Deliver' }, () => this.deliverProcessorService.process(job));
				} else {
					return this.deliverProcessorService.process(job);
				}
			}, {
				...baseWorkerOptions(this.config, QUEUE.DELIVER),
				autorun: false,
				concurrency: this.config.deliverJobConcurrency ?? 128,
				limiter: {
					max: this.config.deliverJobPerSec ?? 128,
					duration: 1000,
				},
				settings: {
					backoffStrategy: httpRelatedBackoff,
				},
			});

			const logger = this.logger.createSubLogger('deliver');

			this.deliverQueueWorker
				.on('active', (job) => logger.debug(`active ${getJobInfo(job, true)} to=${job.data.to}`))
				.on('completed', (job, result) => logger.debug(`completed(${result}) ${getJobInfo(job, true)} to=${job.data.to}`))
				.on('failed', (job, err) => {
					this.logError(logger, err, job);
					if (config.sentryForBackend) {
						Sentry.captureMessage(`Queue: Deliver: ${err.name}: ${err.message}`, {
							level: 'error',
							extra: { job, err },
						});
					}
				})
				.on('error', (err: Error) => this.logError(logger, err))
				.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
		}
		//#endregion

		//#region inbox
		{
			this.inboxQueueWorker = new Bull.Worker(QUEUE.INBOX, (job) => {
				if (this.config.sentryForBackend) {
					return Sentry.startSpan({ name: 'Queue: Inbox' }, () => this.inboxProcessorService.process(job));
				} else {
					return this.inboxProcessorService.process(job);
				}
			}, {
				...baseWorkerOptions(this.config, QUEUE.INBOX),
				autorun: false,
				concurrency: this.config.inboxJobConcurrency ?? 16,
				limiter: {
					max: this.config.inboxJobPerSec ?? 32,
					duration: 1000,
				},
				settings: {
					backoffStrategy: httpRelatedBackoff,
				},
			});

			const logger = this.logger.createSubLogger('inbox');

			this.inboxQueueWorker
				.on('active', (job) => logger.debug(`active ${getJobInfo(job, true)}`))
				.on('completed', (job, result) => logger.debug(`completed(${result}) ${getJobInfo(job, true)}`))
				.on('failed', (job, err) => {
					this.logError(logger, err, job);
					if (config.sentryForBackend) {
						Sentry.captureMessage(`Queue: Inbox: ${err.name}: ${err.message}`, {
							level: 'error',
							extra: { job, err },
						});
					}
				})
				.on('error', (err: Error) => this.logError(logger, err))
				.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
		}
		//#endregion

		//#region user-webhook deliver
		{
			this.userWebhookDeliverQueueWorker = new Bull.Worker(QUEUE.USER_WEBHOOK_DELIVER, (job) => {
				if (this.config.sentryForBackend) {
					return Sentry.startSpan({ name: 'Queue: UserWebhookDeliver' }, () => this.userWebhookDeliverProcessorService.process(job));
				} else {
					return this.userWebhookDeliverProcessorService.process(job);
				}
			}, {
				...baseWorkerOptions(this.config, QUEUE.USER_WEBHOOK_DELIVER),
				autorun: false,
				concurrency: 64,
				limiter: {
					max: 64,
					duration: 1000,
				},
				settings: {
					backoffStrategy: httpRelatedBackoff,
				},
			});

			const logger = this.logger.createSubLogger('user-webhook');

			this.userWebhookDeliverQueueWorker
				.on('active', (job) => logger.debug(`active ${getJobInfo(job, true)} to=${job.data.to}`))
				.on('completed', (job, result) => logger.debug(`completed(${result}) ${getJobInfo(job, true)} to=${job.data.to}`))
				.on('failed', (job, err) => {
					this.logError(logger, err, job);
					if (config.sentryForBackend) {
						Sentry.captureMessage(`Queue: UserWebhookDeliver: ${err.name}: ${err.message}`, {
							level: 'error',
							extra: { job, err },
						});
					}
				})
				.on('error', (err: Error) => this.logError(logger, err))
				.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
		}
		//#endregion

		//#region system-webhook deliver
		{
			this.systemWebhookDeliverQueueWorker = new Bull.Worker(QUEUE.SYSTEM_WEBHOOK_DELIVER, (job) => {
				if (this.config.sentryForBackend) {
					return Sentry.startSpan({ name: 'Queue: SystemWebhookDeliver' }, () => this.systemWebhookDeliverProcessorService.process(job));
				} else {
					return this.systemWebhookDeliverProcessorService.process(job);
				}
			}, {
				...baseWorkerOptions(this.config, QUEUE.SYSTEM_WEBHOOK_DELIVER),
				autorun: false,
				concurrency: 16,
				limiter: {
					max: 16,
					duration: 1000,
				},
				settings: {
					backoffStrategy: httpRelatedBackoff,
				},
			});

			const logger = this.logger.createSubLogger('system-webhook');

			this.systemWebhookDeliverQueueWorker
				.on('active', (job) => logger.debug(`active ${getJobInfo(job, true)} to=${job.data.to}`))
				.on('completed', (job, result) => logger.debug(`completed(${result}) ${getJobInfo(job, true)} to=${job.data.to}`))
				.on('failed', (job, err) => {
					this.logError(logger, err, job);
					if (config.sentryForBackend) {
						Sentry.captureMessage(`Queue: SystemWebhookDeliver: ${err.name}: ${err.message}`, {
							level: 'error',
							extra: { job, err },
						});
					}
				})
				.on('error', (err: Error) => this.logError(logger, err))
				.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
		}
		//#endregion

		//#region relationship
		{
			const processer = (job: Bull.Job) => {
				switch (job.name) {
					case 'follow': return this.relationshipProcessorService.processFollow(job);
					case 'unfollow': return this.relationshipProcessorService.processUnfollow(job);
					case 'block': return this.relationshipProcessorService.processBlock(job);
					case 'unblock': return this.relationshipProcessorService.processUnblock(job);
					case 'move': return this.relationshipProcessorService.processMove(job);
					default: throw new Error(`unrecognized job type ${job.name} for relationship`);
				}
			};

			this.relationshipQueueWorker = new Bull.Worker(QUEUE.RELATIONSHIP, (job) => {
				if (this.config.sentryForBackend) {
					return Sentry.startSpan({ name: 'Queue: Relationship: ' + job.name }, () => processer(job));
				} else {
					return processer(job);
				}
			}, {
				...baseWorkerOptions(this.config, QUEUE.RELATIONSHIP),
				autorun: false,
				concurrency: this.config.relationshipJobConcurrency ?? 16,
				limiter: {
					max: this.config.relationshipJobPerSec ?? 64,
					duration: 1000,
				},
			});

			const logger = this.logger.createSubLogger('relationship');

			this.relationshipQueueWorker
				.on('active', (job) => logger.debug(`active id=${job.id}`))
				.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
				.on('failed', (job, err) => {
					this.logError(logger, err, job);
					if (config.sentryForBackend) {
						Sentry.captureMessage(`Queue: Relationship: ${job?.name ?? '?'}: ${err.name}: ${err.message}`, {
							level: 'error',
							extra: { job, err },
						});
					}
				})
				.on('error', (err: Error) => this.logError(logger, err))
				.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
		}
		//#endregion

		//#region object storage
		{
			const processer = (job: Bull.Job) => {
				switch (job.name) {
					case 'deleteFile': return this.deleteFileProcessorService.process(job);
					case 'cleanRemoteFiles': return this.cleanRemoteFilesProcessorService.process(job);
					default: throw new Error(`unrecognized job type ${job.name} for objectStorage`);
				}
			};

			this.objectStorageQueueWorker = new Bull.Worker(QUEUE.OBJECT_STORAGE, (job) => {
				if (this.config.sentryForBackend) {
					return Sentry.startSpan({ name: 'Queue: ObjectStorage: ' + job.name }, () => processer(job));
				} else {
					return processer(job);
				}
			}, {
				...baseWorkerOptions(this.config, QUEUE.OBJECT_STORAGE),
				autorun: false,
				concurrency: 16,
			});

			const logger = this.logger.createSubLogger('objectStorage');

			this.objectStorageQueueWorker
				.on('active', (job) => logger.debug(`active id=${job.id}`))
				.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
				.on('failed', (job, err) => {
					this.logError(logger, err, job);
					if (config.sentryForBackend) {
						Sentry.captureMessage(`Queue: ObjectStorage: ${job?.name ?? '?'}: ${err.name}: ${err.message}`, {
							level: 'error',
							extra: { job, err },
						});
					}
				})
				.on('error', (err: Error) => this.logError(logger, err))
				.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
		}
		//#endregion

		//#region ended poll notification
		{
			const logger = this.logger.createSubLogger('endedPollNotification');

			this.endedPollNotificationQueueWorker = new Bull.Worker(QUEUE.ENDED_POLL_NOTIFICATION, (job) => {
				if (this.config.sentryForBackend) {
					return Sentry.startSpan({ name: 'Queue: EndedPollNotification' }, () => this.endedPollNotificationProcessorService.process(job));
				} else {
					return this.endedPollNotificationProcessorService.process(job);
				}
			}, {
				...baseWorkerOptions(this.config, QUEUE.ENDED_POLL_NOTIFICATION),
				autorun: false,
			});
			this.endedPollNotificationQueueWorker
				.on('active', (job) => logger.debug(`active id=${job.id}`))
				.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
				.on('failed', (job, err) => {
					this.logError(logger, err, job);
					if (config.sentryForBackend) {
						Sentry.captureMessage(`Queue: EndedPollNotification: ${job?.name ?? '?'}: ${err.name}: ${err.message}`, {
							level: 'error',
							extra: { job, err },
						});
					}
				})
				.on('error', (err: Error) => this.logError(logger, err))
				.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
		}
		//#endregion

		//#region schedule note post
		{
			const logger = this.logger.createSubLogger('scheduleNotePost');

			this.schedulerNotePostQueueWorker = new Bull.Worker(QUEUE.SCHEDULE_NOTE_POST, (job) => this.scheduleNotePostProcessorService.process(job), {
				...baseWorkerOptions(this.config, QUEUE.SCHEDULE_NOTE_POST),
				autorun: false,
			});
			this.schedulerNotePostQueueWorker
				.on('active', (job) => logger.debug(`active id=${job.id}`))
				.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
				.on('failed', (job, err) => {
					this.logError(logger, err, job);
					if (config.sentryForBackend) {
						Sentry.captureMessage(`Queue: ${QUEUE.SCHEDULE_NOTE_POST}: ${job?.name ?? '?'}: ${err.name}: ${err.message}`, {
							level: 'error',
							extra: { job, err },
						});
					}
				})
				.on('error', (err: Error) => this.logError(logger, err))
				.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
		}
		//#endregion

		//#region background tasks
		{
			const logger = this.logger.createSubLogger('backgroundTask');

			this.backgroundTaskWorker = new Bull.Worker(QUEUE.BACKGROUND_TASK, (job) => this.backgroundTaskProcessorService.process(job), {
				...baseWorkerOptions(this.config, QUEUE.BACKGROUND_TASK),
				autorun: false,
				concurrency: this.config.backgroundJobConcurrency ?? 32,
				limiter: {
					max: this.config.backgroundJobPerSec ?? 256,
					duration: 1000,
				},
				settings: {
					backoffStrategy: httpRelatedBackoff,
				},
				// Keep a lot of jobs, because this queue moves *fast*!
				// https://docs.bullmq.io/guide/workers/auto-removal-of-jobs
				removeOnComplete: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 1000,
				},
				removeOnFail: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 1000,
				},
			});
			this.backgroundTaskWorker
				.on('active', (job) => logger.debug(`active id=${job.id}`))
				.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
				.on('failed', (job, err) => {
					this.logError(logger, err, job);
					if (config.sentryForBackend) {
						Sentry.captureMessage(`Queue: ${QUEUE.BACKGROUND_TASK}: ${job?.name ?? '?'}: ${err.name}: ${err.message}`, {
							level: 'error',
							extra: { job, err },
						});
					}
				})
				.on('error', (err: Error) => this.logError(logger, err))
				.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
		}
		//#endregion
	}

	private logError(logger: Logger, err: unknown, job?: Bull.Job | null): void {
		const parts: string[] = [];

		// Render job
		if (job) {
			parts.push('job [');
			parts.push(_getJobInfo(this.timeService.now, job));
			parts.push('] failed: ');
		} else {
			parts.push('job failed: ');
		}

		// Render error
		const fullError = renderFullError(err);
		const errorText = typeof(fullError) === 'string' ? fullError : undefined;
		if (errorText) {
			parts.push(errorText);
		} else if (job?.failedReason) {
			parts.push(job.failedReason);
		}

		const message = parts.join('');
		const data = typeof(fullError) !== 'string' ? { err: fullError } : undefined;
		logger.error(message, data);
	}

	@bindThis
	public async start(): Promise<void> {
		await Promise.all([
			this.systemQueueWorker.run(),
			this.dbQueueWorker.run(),
			this.deliverQueueWorker.run(),
			this.inboxQueueWorker.run(),
			this.userWebhookDeliverQueueWorker.run(),
			this.systemWebhookDeliverQueueWorker.run(),
			this.relationshipQueueWorker.run(),
			this.objectStorageQueueWorker.run(),
			this.endedPollNotificationQueueWorker.run(),
			this.schedulerNotePostQueueWorker.run(),
			this.backgroundTaskWorker.run(),
		]);
	}

	@bindThis
	public async stop(): Promise<void> {
		await Promise.allSettled([
			this.systemQueueWorker.close(),
			this.dbQueueWorker.close(),
			this.deliverQueueWorker.close(),
			this.inboxQueueWorker.close(),
			this.userWebhookDeliverQueueWorker.close(),
			this.systemWebhookDeliverQueueWorker.close(),
			this.relationshipQueueWorker.close(),
			this.objectStorageQueueWorker.close(),
			this.endedPollNotificationQueueWorker.close(),
			this.schedulerNotePostQueueWorker.close(),
			this.backgroundTaskWorker.close(),
		]).then(res => {
			for (const result of res) {
				if (result.status === 'rejected') {
					this.logger.error(`Error closing queue: ${renderInlineError(result.reason)}`);
				}
			}
		});
	}

	@bindThis
	public async onApplicationShutdown(signal?: string | undefined): Promise<void> {
		this.logger.info('Stopping BullMQ workers...');
		await this.stop();
		this.logger.info('Workers disposed.');
	}
}
