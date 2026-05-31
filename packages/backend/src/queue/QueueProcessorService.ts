/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	Inject,
	Injectable,
	type OnApplicationBootstrap,
	type BeforeApplicationShutdown,
} from '@nestjs/common';
import * as Bull from 'bullmq';
import * as Sentry from '@sentry/node';
import type { Config } from '@/config.js';
import type { Logger } from '@/logger.js';
import type {
	Jobs,
	Workers,
	QueueType,
	QueueData,
	CleanRemoteFilesJobData,
	DbDeleteDriveFilesJobData,
	DbExportAccountDataJobData,
	DbExportCustomEmojisJobData,
	DbExportAntennasJobData,
	DbExportNotesJobData,
	DbExportClipsJobData,
	DbExportFavoritesJobData,
	DbExportFollowingJobData,
	DbExportMutingJobData,
	DbExportBlockingJobData,
	DbExportUserListsJobData,
	DbImportAntennasJobData,
	DbImportNotesJobData,
	DbImportTweetsToDbJobData,
	DbImportIGToDbJobData,
	DbImportFBToDbJobData,
	DbImportMastoToDbJobData,
	DbImportPleroToDbJobData,
	DbImportKeyNotesToDbJobData,
	DbImportFollowingJobData,
	DbImportFollowingToDbJobData,
	DbImportMutingJobData,
	DbImportBlockingJobData,
	DbImportBlockingToDbJobData,
	DbImportUserListsJobData,
	DbImportCustomEmojisJobData,
	DbDeleteAccountJobData,
	ObjectStorageFileJobData,
	ObjectStorageJobData,
	RelationshipJobData,
	SystemJobData,
	DaemonJobData,
} from '@/queue/types.js';
import { DI } from '@/di-symbols.js';
import { promiseTry } from '@/misc/promise-try.js';
import { getWorkerOptions } from '@/queue/const.js';
import { bindThis } from '@/decorators.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { renderFullError } from '@/misc/render-full-error.js';
import { isRetryableError } from '@/misc/is-retryable-error.js';
import { CheckModeratorsActivityProcessorService } from '@/queue/processors/CheckModeratorsActivityProcessorService.js';
import { QueueStatsService } from '@/core/QueueStatsService.js';
import { ServerStatsService } from '@/core/ServerStatsService.js';
import { TimeService } from '@/global/TimeService.js';
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
import { ImportNotesProcessorService } from './processors/ImportNotesProcessorService.js';
import { CleanupApLogsProcessorService } from './processors/CleanupApLogsProcessorService.js';
import { HibernateUsersProcessorService } from './processors/HibernateUsersProcessorService.js';
import { BackgroundTaskProcessorService } from './processors/BackgroundTaskProcessorService.js';

// ref. https://github.com/misskey-dev/misskey/pull/7635#issue-971097019
// TODO respect 429 rate limit
// TODO distribute based on number failing to the same host
function httpRelatedBackoff(attemptsMade: number, type?: string, error?: Error) {
	// Don't retry permanent errors
	// https://docs.bullmq.io/guide/retrying-failing-jobs#custom-back-off-strategies
	if (error && !isRetryableError(error)) {
		return -1;
	}

	// MIN((2^n) - 1 minutes, 8 hours) +- RAND(0%, 20%)
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
export class QueueProcessorService implements OnApplicationBootstrap, BeforeApplicationShutdown {
	private readonly logger: Logger;
	private readonly workers = {} as Partial<Workers>;

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
		private readonly queueStatsService: QueueStatsService,
		private readonly serverStatsService: ServerStatsService,
	) {
		this.logger = this.queueLoggerService.logger;
	}

	@bindThis
	public onApplicationBootstrap() {
		//#region system
		{
			const processer = async (job: Bull.Job<SystemJobData>) => {
				switch (job.data.type) {
					case 'tickCharts': return await this.tickChartsProcessorService.process();
					case 'resyncCharts': return await this.resyncChartsProcessorService.process();
					case 'cleanCharts': return await this.cleanChartsProcessorService.process();
					case 'aggregateRetention': return await this.aggregateRetentionProcessorService.process();
					case 'checkExpiredMutings': return await this.checkExpiredMutingsProcessorService.process();
					case 'bakeBufferedReactions': return await this.bakeBufferedReactionsProcessorService.process();
					case 'checkModeratorsActivity': return await this.checkModeratorsActivityProcessorService.process();
					case 'clean': return await this.cleanProcessorService.process();
					case 'cleanupApLogs': return await this.cleanupApLogsProcessorService.process();
					case 'hibernateUsers': return await this.hibernateUsersProcessorService.process();
					// @ts-expect-error it doesn't realize that we're *trying* to catch unknown values here
					default: throw new Error(`unrecognized job type ${job.data.type} for system`);
				}
			};

			this.createWorker('system', processer);
		}
		//#endregion

		//#region daemon
		{
			const processer = async (job: Bull.Job<DaemonJobData>) => {
				switch (job.data.type) {
					case 'tickServerStats': {
						await this.serverStatsService.tick();
						return 'ok';
					}
					case 'tickQueueCounts': {
						await this.queueStatsService.tick();
						return 'ok';
					}
					// @ts-expect-error it doesn't realize that we're *trying* to catch unknown values here
					default: throw new Error(`unrecognized job type ${job.data.type} for daemon`);
				}
			};

			this.createWorker('daemon', processer);
		}
		//#endregion

		//#region db
		{
			const processer = async (job: Jobs['db']) => {
				switch (job.data.type) {
					case 'deleteDriveFiles': return await this.deleteDriveFilesProcessorService.process(job as Bull.Job<DbDeleteDriveFilesJobData>);
					case 'exportCustomEmojis': return await this.exportCustomEmojisProcessorService.process(job as Bull.Job<DbExportCustomEmojisJobData>);
					case 'exportNotes': return await this.exportNotesProcessorService.process(job as Bull.Job<DbExportNotesJobData>);
					case 'exportClips': return await this.exportClipsProcessorService.process(job as Bull.Job<DbExportClipsJobData>);
					case 'exportFavorites': return await this.exportFavoritesProcessorService.process(job as Bull.Job<DbExportFavoritesJobData>);
					case 'exportFollowing': return await this.exportFollowingProcessorService.process(job as Bull.Job<DbExportFollowingJobData>);
					case 'exportMuting': return await this.exportMutingProcessorService.process(job as Bull.Job<DbExportMutingJobData>);
					case 'exportBlocking': return await this.exportBlockingProcessorService.process(job as Bull.Job<DbExportBlockingJobData>);
					case 'exportUserLists': return await this.exportUserListsProcessorService.process(job as Bull.Job<DbExportUserListsJobData>);
					case 'exportAntennas': return await this.exportAntennasProcessorService.process(job as Bull.Job<DbExportAntennasJobData>);
					case 'exportAccountData': return await this.exportAccountDataProcessorService.process(job as Bull.Job<DbExportAccountDataJobData>);
					case 'importFollowing': return await this.importFollowingProcessorService.process(job as Bull.Job<DbImportFollowingJobData>);
					case 'importFollowingToDb': return await this.importFollowingProcessorService.processDb(job as Bull.Job<DbImportFollowingToDbJobData>);
					case 'importMuting': return await this.importMutingProcessorService.process(job as Bull.Job<DbImportMutingJobData>);
					case 'importBlocking': return await this.importBlockingProcessorService.process(job as Bull.Job<DbImportBlockingJobData>);
					case 'importBlockingToDb': return await this.importBlockingProcessorService.processDb(job as Bull.Job<DbImportBlockingToDbJobData>);
					case 'importUserLists': return await this.importUserListsProcessorService.process(job as Bull.Job<DbImportUserListsJobData>);
					case 'importCustomEmojis': return await this.importCustomEmojisProcessorService.process(job as Bull.Job<DbImportCustomEmojisJobData>);
					case 'importAntennas': return await this.importAntennasProcessorService.process(job as Bull.Job<DbImportAntennasJobData>);
					case 'importNotes': return await this.importNotesProcessorService.process(job as Bull.Job<DbImportNotesJobData>);
					case 'importTweetsToDb': return await this.importNotesProcessorService.processTwitterDb(job as Bull.Job<DbImportTweetsToDbJobData>);
					case 'importIGToDb': return await this.importNotesProcessorService.processIGDb(job as Bull.Job<DbImportIGToDbJobData>);
					case 'importFBToDb': return await this.importNotesProcessorService.processFBDb(job as Bull.Job<DbImportFBToDbJobData>);
					case 'importMastoToDb': return await this.importNotesProcessorService.processMastoToDb(job as Bull.Job<DbImportMastoToDbJobData>);
					case 'importPleroToDb': return await this.importNotesProcessorService.processPleroToDb(job as Bull.Job<DbImportPleroToDbJobData>);
					case 'importKeyNotesToDb': return await this.importNotesProcessorService.processKeyNotesToDb(job as Bull.Job<DbImportKeyNotesToDbJobData>);
					case 'deleteAccount': return await this.deleteAccountProcessorService.process(job as Bull.Job<DbDeleteAccountJobData>);
					// @ts-expect-error it doesn't realize that we're *trying* to catch unknown values here
					default: throw new Error(`unrecognized job type ${job.data.type} for db job ${job.name}`);
				}
			};

			this.createWorker('db', processer);
		}
		//#endregion

		//#region deliver
		{
			this.createWorker('deliver', this.deliverProcessorService.process, {
				settings: {
					backoffStrategy: httpRelatedBackoff,
				},
			});
		}
		//#endregion

		//#region inbox
		{
			this.createWorker('inbox', this.inboxProcessorService.process, {
				settings: {
					backoffStrategy: httpRelatedBackoff,
				},
			});
		}
		//#endregion

		//#region user-webhook deliver
		{
			this.createWorker('userWebhookDeliver', this.userWebhookDeliverProcessorService.process, {
				settings: {
					backoffStrategy: httpRelatedBackoff,
				},
			});
		}
		//#endregion

		//#region system-webhook deliver
		{
			this.createWorker('systemWebhookDeliver', this.systemWebhookDeliverProcessorService.process, {
				settings: {
					backoffStrategy: httpRelatedBackoff,
				},
			});
		}
		//#endregion

		//#region relationship
		{
			const processer = async (job: Bull.Job<RelationshipJobData>) => {
				switch (job.data.type) {
					case 'follow': return await this.relationshipProcessorService.processFollow(job);
					case 'unfollow': return await this.relationshipProcessorService.processUnfollow(job);
					case 'block': return await this.relationshipProcessorService.processBlock(job);
					case 'unblock': return await this.relationshipProcessorService.processUnblock(job);
					case 'move': return await this.relationshipProcessorService.processMove(job);
					default: throw new Error(`unrecognized job type ${job.data.type} for relationship`);
				}
			};

			this.createWorker('relationship', processer);
		}
		//#endregion

		//#region object storage
		{
			const processer = async (job: Bull.Job<ObjectStorageJobData>) => {
				switch (job.data.type) {
					case 'deleteFile': return await this.deleteFileProcessorService.process(job as Bull.Job<ObjectStorageFileJobData>);
					case 'cleanRemoteFiles': return await this.cleanRemoteFilesProcessorService.process(job as Bull.Job<CleanRemoteFilesJobData>);
					// @ts-expect-error it doesn't realize that we're *trying* to catch unknown values here
					default: throw new Error(`unrecognized job type ${job.data.type} for objectStorage`);
				}
			};

			this.createWorker('objectStorage', processer);
		}
		//#endregion

		//#region ended poll notification
		{
			this.createWorker('endedPollNotification', this.endedPollNotificationProcessorService.process);
		}
		//#endregion

		//#region schedule note post
		{
			this.createWorker('scheduleNotePost', this.scheduleNotePostProcessorService.process);
		}
		//#endregion

		//#region background tasks
		{
			this.createWorker('backgroundTask', async job => await this.backgroundTaskProcessorService.process(job.data), {
				settings: {
					backoffStrategy: httpRelatedBackoff,
				},
			});
		}
		//#endregion
	}

	@bindThis
	private createWorker<QT extends QueueType>(qt: QT, processor: (job: Jobs[QT]) => Promise<string | void>, opts?: Partial<Bull.WorkerOptions>): void {
		const logger = this.logger.createSubLogger(qt);
		const options = getWorkerOptions(this.config, qt);
		if (options.concurrency < 1) {
			logger.info(`Not connecting ${qt} queue - disabled in config (concurrency < 1)`);
			return;
		}

		logger.debug(`Connecting ${qt} queue...`);
		const worker = new Bull.Worker<QueueData[QT], string | void, string>(qt, async (job: Jobs[QT]) => {
			if (this.config.sentryForBackend) {
				return await Sentry.startSpan({ name: `Queue: ${qt}: ` + job.name }, async () => await processor(job));
			} else {
				return await processor(job);
			}
		}, {
			...options,
			...(opts ?? {}),
		});

		worker
			.on('active', (job) => logger.debug(`active id=${job.id}`))
			.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
			.on('failed', (job, err: Error) => {
				this.logError(logger, err, job);
				if (this.config.sentryForBackend) {
					Sentry.captureMessage(`Queue: System: ${job?.name ?? '?'}: ${err.name}: ${err.message}`, {
						level: 'error',
						extra: { job, err },
					});
				}
			})
			.on('error', (err: Error) => this.logError(logger, err))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));

		// For some reason the type cast is needed...
		this.workers[qt] = worker as Workers[QT];
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
	public start() {
		// TODO refactor so that we can detect startup errors.
		//   Due to Bull's unfortunate Worker implementation, the *only* way to reliably detect exceptions is by attaching events at construction time.
		//   These calls to run only return on shutdown or error, so we can't await them.
		//   They also don't emit any events when starting, so we can wrap in a promise either.

		for (const [queue, worker] of Object.entries(this.workers)) {
			this.logger.debug(`Starting ${queue} worker...`);
			worker.run();
		}
	}

	@bindThis
	public async stop(): Promise<void> {
		const promises = Object.values(this.workers).map(w => promiseTry(() => w.close()));
		const res = await Promise.allSettled(promises);
		{
			for (const result of res) {
				if (result.status === 'rejected') {
					this.logger.error(`Error closing queue: ${renderInlineError(result.reason)}`);
				}
			}
		}
	}

	@bindThis
	public async beforeApplicationShutdown(): Promise<void> {
		this.logger.info('Stopping BullMQ workers...');
		await this.stop();
		this.logger.info('Workers disposed.');
	}
}
