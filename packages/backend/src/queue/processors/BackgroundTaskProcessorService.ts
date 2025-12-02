/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Bull from 'bullmq';
import { BackgroundTaskJobData, CheckHibernationBackgroundTask, PostDeliverBackgroundTask, PostInboxBackgroundTask, PostNoteBackgroundTask, UpdateFeaturedBackgroundTask, UpdateInstanceBackgroundTask, UpdateUserTagsBackgroundTask, UpdateUserBackgroundTask, UpdateNoteTagsBackgroundTask, DeleteFileBackgroundTask, UpdateLatestNoteBackgroundTask, PostSuspendBackgroundTask, PostUnsuspendBackgroundTask, DeleteApLogsBackgroundTask } from '@/queue/types.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import { QueueLoggerService } from '@/queue/QueueLoggerService.js';
import Logger from '@/logger.js';
import { DI } from '@/di-symbols.js';
import { CacheService } from '@/core/CacheService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { FetchInstanceMetadataService } from '@/core/FetchInstanceMetadataService.js';
import { MiMeta } from '@/models/Meta.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import ApRequestChart from '@/core/chart/charts/ap-request.js';
import FederationChart from '@/core/chart/charts/federation.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import type { DriveFilesRepository, NoteEditsRepository, NotesRepository, PollsRepository } from '@/models/_.js';
import { MiUser } from '@/models/_.js';
import { NoteEditService } from '@/core/NoteEditService.js';
import { HashtagService } from '@/core/HashtagService.js';
import { DriveService } from '@/core/DriveService.js';
import { LatestNoteService } from '@/core/LatestNoteService.js';
import { trackTask } from '@/misc/promise-tracker.js';
import { UserSuspendService } from '@/core/UserSuspendService.js';
import { ApLogService } from '@/core/ApLogService.js';
import { CollapsedQueueService } from '@/core/CollapsedQueueService.js';
import { isRemoteUser } from '@/models/User.js';
import { errorCodes, IdentifiableError } from '@/misc/identifiable-error.js';
import { TimeService } from '@/global/TimeService.js';

@Injectable()
export class BackgroundTaskProcessorService {
	private readonly logger: Logger;

	constructor(
		@Inject(DI.meta)
		private readonly meta: MiMeta,

		@Inject(DI.notesRepository)
		private readonly notesRepository: NotesRepository,

		@Inject(DI.driveFilesRepository)
		private readonly driveFilesRepository: DriveFilesRepository,

		@Inject(DI.noteEditsRepository)
		private readonly noteEditsRepository: NoteEditsRepository,

		@Inject(DI.pollsRepository)
		private readonly pollsRepository: PollsRepository,

		private readonly apPersonService: ApPersonService,
		private readonly cacheService: CacheService,
		private readonly federatedInstanceService: FederatedInstanceService,
		private readonly fetchInstanceMetadataService: FetchInstanceMetadataService,
		private readonly instanceChart: InstanceChart,
		private readonly apRequestChart: ApRequestChart,
		private readonly federationChart: FederationChart,
		private readonly collapsedQueueService: CollapsedQueueService,
		private readonly noteCreateService: NoteCreateService,
		private readonly noteEditService: NoteEditService,
		private readonly hashtagService: HashtagService,
		private readonly driveService: DriveService,
		private readonly latestNoteService: LatestNoteService,
		private readonly userSuspendService: UserSuspendService,
		private readonly apLogService: ApLogService,
		private readonly timeService: TimeService,

		queueLoggerService: QueueLoggerService,
	) {
		this.logger = queueLoggerService.logger.createSubLogger('background-task');
	}

	public async process(job: Bull.Job<BackgroundTaskJobData>): Promise<string> {
		if (job.data.type === 'update-user') {
			return await this.processUpdateUser(job.data);
		} else if (job.data.type === 'update-featured') {
			return await this.processUpdateFeatured(job.data);
		} else if (job.data.type === 'update-user-tags') {
			return await this.processUpdateUserTags(job.data);
		} else if (job.data.type === 'update-note-tags') {
			return await this.processUpdateNoteTags(job.data);
		} else if (job.data.type === 'update-instance') {
			return await this.processUpdateInstance(job.data);
		} else if (job.data.type === 'post-deliver') {
			return await this.processPostDeliver(job.data);
		} else if (job.data.type === 'post-inbox') {
			return await this.processPostInbox(job.data);
		} else if (job.data.type === 'post-note') {
			return await this.processPostNote(job.data);
		} else if (job.data.type === 'delete-file') {
			return await this.processDeleteFile(job.data);
		} else if (job.data.type === 'update-latest-note') {
			return await this.processUpdateLatestNote(job.data);
		} else if (job.data.type === 'post-suspend') {
			return await this.processPostSuspend(job.data);
		} else if (job.data.type === 'post-unsuspend') {
			return await this.processPostUnsuspend(job.data);
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		} else if (job.data.type === 'delete-ap-logs') {
			return await this.processDeleteApLogs(job.data);
		} else {
			this.logger.warn(`Can't process unknown job type "${job.data}"; this is likely a bug. Full job data:`, job.data);
			throw new Error(`Unknown job type ${job.data}, see system logs for details`);
		}
	}

	private async processUpdateUser(task: UpdateUserBackgroundTask): Promise<string> {
		const user = await this.cacheService.findOptionalUserById(task.userId);
		if (!user || user.isDeleted) return `Skipping update-user task: user ${task.userId} has been deleted`;
		if (user.isSuspended) return `Skipping update-user task: user ${task.userId} is suspended`;
		if (!isRemoteUser(user)) return `Skipping update-user task: user ${task.userId} is local`;

		if (user.lastFetchedAt && this.timeService.now - user.lastFetchedAt.getTime() < 1000 * 60 * 60 * 24) {
			return `Skipping update-user task: user ${task.userId} was recently updated`;
		}

		await this.apPersonService.updatePerson(user.uri);
		return 'ok';
	}

	private async processUpdateFeatured(task: UpdateFeaturedBackgroundTask): Promise<string> {
		const user = await this.cacheService.findOptionalUserById(task.userId);
		if (!user || user.isDeleted) return `Skipping update-featured task: user ${task.userId} has been deleted`;
		if (user.isSuspended) return `Skipping update-featured task: user ${task.userId} is suspended`;
		if (!isRemoteUser(user)) return `Skipping update-featured task: user ${task.userId} is local`;
		if (!user.featured) return `Skipping update-featured task: user ${task.userId} has no featured collection`;

		if (user.lastFetchedFeaturedAt && this.timeService.now - user.lastFetchedFeaturedAt.getTime() < 1000 * 60 * 60 * 24) {
			return `Skipping update-featured task: user ${task.userId} was recently updated`;
		}

		try {
			await this.apPersonService.updateFeatured(user);
		} catch (err) {
			if (err instanceof IdentifiableError) {
				if (err.id === errorCodes.userIsSuspended) return err.message;
				if (err.id === errorCodes.userIsDeleted) return err.message;
				if (err.id === errorCodes.noFeaturedCollection) return err.message;
			}
			throw err;
		}
		return 'ok';
	}

	private async processUpdateUserTags(task: UpdateUserTagsBackgroundTask): Promise<string> {
		const user = await this.cacheService.findOptionalUserById(task.userId);
		if (!user || user.isDeleted) return `Skipping update-user-tags task: user ${task.userId} has been deleted`;
		if (user.isSuspended) return `Skipping update-user-tags task: user ${task.userId} is suspended`;
		if (!isRemoteUser(user)) return `Skipping update-user-tags task: user ${task.userId} is local`;

		await this.hashtagService.updateUsertags(user, user.tags);
		return 'ok';
	}

	private async processUpdateNoteTags(task: UpdateNoteTagsBackgroundTask): Promise<string> {
		const note = await this.notesRepository.findOneBy({ id: task.noteId });
		if (!note) return `Skipping update-note-tags task: note ${task.noteId} has been deleted`;
		const user = await this.cacheService.findUserById(note.userId);
		if (user.isSuspended) return `Skipping update-note-tags task: note ${task.noteId}'s user ${note.userId} is suspended`;

		await this.hashtagService.updateHashtags(user, note.tags);
		return 'ok';
	}

	private async processUpdateInstance(task: UpdateInstanceBackgroundTask): Promise<string> {
		const instance = await this.federatedInstanceService.fetch(task.host);
		if (instance.isBlocked) return `Skipping update-instance task: instance ${task.host} is blocked`;
		if (instance.suspensionState === 'goneSuspended') return `Skipping update-instance task: instance ${task.host} is gone`;

		if (instance.infoUpdatedAt && this.timeService.now - instance.infoUpdatedAt.getTime() < 1000 * 60 * 60 * 24) {
			return `Skipping update-instance task: instance ${task.host} was recently updated`;
		}

		await this.fetchInstanceMetadataService.fetchInstanceMetadata(instance);
		return 'ok';
	}

	private async processPostDeliver(task: PostDeliverBackgroundTask): Promise<string> {
		const instance = await this.federatedInstanceService.fetchOrRegister(task.host);
		if (instance.isBlocked) return `Skipping post-deliver task: instance ${task.host} is blocked`;

		const success = task.result === 'success';

		// isNotResponding should be the inverse of success, because:
		//  1. We expect success (success=true) from a responding instance (isNotResponding=false).
		//  2. We expect failure (success=false) from a non-responding instance (isNotResponding=true).
		// If they are equal, then we need to update the cached state.
		const updateNotResponding = success === instance.isNotResponding;

		// If we get a permanent failure, then we need to immediately suspend the instance
		const updateGoneSuspended = task.result === 'perm-fail' && instance.suspensionState !== 'goneSuspended';

		// Check if we need to auto-suspend the instance
		const updateAutoSuspended = instance.isNotResponding && instance.notRespondingSince && instance.suspensionState === 'none' && instance.notRespondingSince.getTime() <= this.timeService.now - 1000 * 60 * 60 * 24 * 7;

		// This is messy, but we need to minimize updates to space in Postgres blocks.
		if (updateNotResponding || updateGoneSuspended || updateAutoSuspended) {
			await this.collapsedQueueService.updateInstanceQueue.enqueue(instance.id, {
				notRespondingSince: updateNotResponding ? (success ? null : this.timeService.date) : undefined,
				shouldSuspendGone: updateGoneSuspended || undefined,
				shouldSuspendNotResponding: updateAutoSuspended || undefined,
			});
		}

		// Update instance metadata (deferred)
		if (success && this.meta.enableStatsForFederatedInstances) {
			await this.fetchInstanceMetadataService.fetchInstanceMetadataLazy(instance);
		}

		// Update charts
		if (this.meta.enableChartsForFederatedInstances) {
			this.instanceChart.requestSent(task.host, success);
		}
		if (success) {
			this.apRequestChart.deliverSucc();
		} else {
			this.apRequestChart.deliverFail();
		}
		this.federationChart.deliverd(task.host, success);

		return 'ok';
	}

	private async processPostInbox(task: PostInboxBackgroundTask): Promise<string> {
		const instance = await this.federatedInstanceService.fetchOrRegister(task.host);
		if (instance.isBlocked) return `Skipping post-inbox task: instance ${task.host} is blocked`;

		// Update charts
		if (this.meta.enableChartsForFederatedInstances) {
			this.instanceChart.requestReceived(task.host);
		}
		this.apRequestChart.inbox();
		this.federationChart.inbox(task.host);

		// Update instance metadata (deferred)
		await this.fetchInstanceMetadataService.fetchInstanceMetadataLazy(instance);

		// Unsuspend instance (deferred)
		await this.collapsedQueueService.updateInstanceQueue.enqueue(instance.id, {
			latestRequestReceivedAt: this.timeService.date,
			shouldUnsuspend: instance.suspensionState === 'autoSuspendedForNotResponding',
		});

		return 'ok';
	}

	private async processPostNote(task: PostNoteBackgroundTask): Promise<string> {
		const note = await this.notesRepository.findOne({
			where: { id: task.noteId },
			relations: { renote: true, reply: true, channel: true },
		});
		if (!note) return `Skipping post-note task: note ${task.noteId} has been deleted`;
		const user = await this.cacheService.findUserById(note.userId);
		if (user.isSuspended) return `Skipping post-note task: note ${task.noteId}'s user ${note.userId} is suspended`;
		note.user = user;

		const mentionedUsers = await this.cacheService.findUsersById(note.mentions);
		const poll = await this.pollsRepository.findOneBy({ noteId: note.id });

		if (task.edit) {
			await this.noteEditService.postNoteEdited(note, user, { ...note, poll }, task.silent, Array.from(mentionedUsers.values()));
		} else {
			await this.noteCreateService.postNoteCreated(note, user, { ...note, poll }, task.silent, Array.from(mentionedUsers.values()));
		}

		return 'ok';
	}

	private async processDeleteFile(task: DeleteFileBackgroundTask): Promise<string> {
		const file = await this.driveFilesRepository.findOneBy({ id: task.fileId });
		if (!file) return `Skipping delete-file task: file ${task.fileId} has been deleted`;

		let deleter: MiUser | undefined = undefined;
		if (task.deleterId) {
			deleter = await this.cacheService.findOptionalUserById(task.deleterId);
			if (!deleter) {
				this.logger.warn(`[delete-file] Deleting user ${task.deleterId} has been deleted; proceeding with null deleter`);
			}
		}

		await this.driveService.deleteFileSync(file, task.isExpired, deleter);
		return 'ok';
	}

	private async processUpdateLatestNote(task: UpdateLatestNoteBackgroundTask): Promise<string> {
		const note = await this.notesRepository.findOneBy({ id: task.note.id });

		if (note) {
			const lastEdit = await this.noteEditsRepository.findOne({
				where: { noteId: task.note.id },
				order: { id: 'desc' },
			});

			if (lastEdit) {
				// Update
				await this.latestNoteService.handleUpdatedNote(lastEdit, note);
			} else {
				// Create
				await this.latestNoteService.handleCreatedNote(note);
			}
		} else {
			// Delete
			await this.latestNoteService.handleDeletedNote(task.note);
		}

		return 'ok';
	}

	private async processPostSuspend(task: PostSuspendBackgroundTask): Promise<string> {
		const user = await this.cacheService.findOptionalUserById(task.userId);
		if (!user || user.isDeleted) return `Skipping post-suspend task: user ${task.userId} has been deleted`;

		await trackTask(async () => {
			await this.userSuspendService.postSuspend(user);
		});

		return 'ok';
	}

	private async processPostUnsuspend(task: PostUnsuspendBackgroundTask): Promise<string> {
		const user = await this.cacheService.findOptionalUserById(task.userId);
		if (!user || user.isDeleted) return `Skipping post-unsuspend task: user ${task.userId} has been deleted`;

		await trackTask(async () => {
			await this.userSuspendService.postUnsuspend(user);
		});

		return 'ok';
	}

	private async processDeleteApLogs(task: DeleteApLogsBackgroundTask): Promise<string> {
		if (task.dataType === 'object') {
			await this.apLogService.deleteObjectLogs(task.data);
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		} else if (task.dataType === 'inbox') {
			await this.apLogService.deleteInboxLogs(task.data);
		} else {
			this.logger.warn(`Can't process unknown data type "${task.dataType}"; this is likely a bug. Full task data:`, task);
			throw new Error(`Unknown task type ${task.dataType}, see system logs for details`);
		}

		return 'ok';
	}
}
