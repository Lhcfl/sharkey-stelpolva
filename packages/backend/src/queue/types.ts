/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { SystemWebhookEventType } from '@/models/SystemWebhook.js';
import type { MiUser } from '@/models/User.js';
import type { MiWebhook, WebhookEventTypes } from '@/models/Webhook.js';
import type { IActivity } from '@/core/activitypub/type.js';
import type { SystemWebhookPayload } from '@/core/SystemWebhookService.js';
import type { UserWebhookPayload } from '@/core/UserWebhookService.js';
import type { MinimalNote } from '@/misc/is-renote.js';
import type { QUEUE_TYPES } from '@/queue/const.js';
import type * as Bull from 'bullmq';
import type httpSignature from '@peertube/http-signature';

export type QueueType = typeof QUEUE_TYPES[number];

export type QueueData = {
	deliver: DeliverJobData;
	inbox: InboxJobData;
	system: SystemJobData;
	daemon: DaemonJobData;
	endedPollNotification: EndedPollNotificationJobData;
	db: DbJobData;
	relationship: RelationshipJobData;
	objectStorage: ObjectStorageJobData;
	userWebhookDeliver: UserWebhookDeliverJobData;
	systemWebhookDeliver: SystemWebhookDeliverJobData;
	scheduleNotePost: ScheduleNotePostJobData;
	backgroundTask: BackgroundTaskJobData;
};

export type Queues = {
	// <data type, result type, name type>
	[QT in QueueType]: Bull.Queue<QueueData[QT], string | void, string>;
};

export type QueueEvents = {
	[QT in QueueType]: Bull.QueueEvents;
};

export type Jobs = {
	[QT in QueueType]: Bull.Job<QueueData[QT], string | void, string>;
};

export type Workers = {
	[QT in QueueType]: Bull.Worker<QueueData[QT], string | void, string>;
};

export type DeliverJobData = {
	/** Actor */
	user: ThinUser;
	/** Activity */
	content: string;
	/** Digest header */
	digest: string;
	/** inbox URL to deliver */
	to: string;
	/** whether it is sharedInbox */
	isSharedInbox: boolean;
};

export type SystemJobData =
	SystemTickChartsJobData |
	SystemResyncChartsJobData |
	SystemCleanChartsJobData |
	SystemAggregateRetentionJobData |
	SystemCheckExpiredMutingsJobData |
	SystemBakeBufferedReactionsJobData |
	SystemCheckModeratorsActivityJobData |
	SystemCleanJobData |
	SystemCleanupApLogsJobData |
	SystemHibernateUsersJobData;

export type SystemTickChartsJobData = {
	type: 'tickCharts';
};

export type SystemResyncChartsJobData = {
	type: 'resyncCharts';
};

export type SystemCleanChartsJobData = {
	type: 'cleanCharts';
};

export type SystemAggregateRetentionJobData = {
	type: 'aggregateRetention';
};

export type SystemCheckExpiredMutingsJobData = {
	type: 'checkExpiredMutings';
};

export type SystemBakeBufferedReactionsJobData = {
	type: 'bakeBufferedReactions';
};

export type SystemCheckModeratorsActivityJobData = {
	type: 'checkModeratorsActivity';
};

export type SystemCleanJobData = {
	type: 'clean';
};

export type SystemCleanupApLogsJobData = {
	type: 'cleanupApLogs';
};

export type SystemHibernateUsersJobData = {
	type: 'hibernateUsers';
};

export type InboxJobData = {
	activity: IActivity;
	signature: httpSignature.IParsedSignature;
};

export type DaemonJobData =
	TickServerStatsDaemonJobData |
	TickQueueCountsDaemonJobData;

export type TickServerStatsDaemonJobData = {
	type: 'tickServerStats';
};

export type TickQueueCountsDaemonJobData = {
	type: 'tickQueueCounts';
};

export type RelationshipJobData = {
	type: string;
	from: ThinUser;
	to: ThinUser;
	silent?: boolean;
	requestId?: string;
	withReplies?: boolean;
};

export type CleanRemoteFilesJobData = {
	type: 'cleanRemoteFiles';
	keepFilesInUse: boolean;
	olderThanSeconds: number;
};

export type DbJobData =
	DbDeleteDriveFilesJobData |
	DbExportAccountDataJobData |
	DbExportCustomEmojisJobData |
	DbExportAntennasJobData |
	DbExportNotesJobData |
	DbExportClipsJobData |
	DbExportFavoritesJobData |
	DbExportFollowingJobData |
	DbExportMutingJobData |
	DbExportBlockingJobData |
	DbExportUserListsJobData |
	DbImportAntennasJobData |
	DbImportNotesJobData |
	DbImportTweetsToDbJobData |
	DbImportIGToDbJobData |
	DbImportFBToDbJobData |
	DbImportMastoToDbJobData |
	DbImportPleroToDbJobData |
	DbImportKeyNotesToDbJobData |
	DbImportFollowingJobData |
	DbImportFollowingToDbJobData |
	DbImportMutingJobData |
	DbImportBlockingJobData |
	DbImportBlockingToDbJobData |
	DbImportUserListsJobData |
	DbImportCustomEmojisJobData |
	DbDeleteAccountJobData;

export type DbDeleteDriveFilesJobData = {
	type: 'deleteDriveFiles';
	user: ThinUser;
};

export type DbExportAccountDataJobData = {
	type: 'exportAccountData';
	user: ThinUser;
};

export type DbExportCustomEmojisJobData = {
	type: 'exportCustomEmojis';
	user: ThinUser;
};

export type DbExportAntennasJobData = {
	type: 'exportAntennas';
	user: ThinUser;
};

export type DbExportNotesJobData = {
	type: 'exportNotes';
	user: ThinUser;
};

export type DbExportClipsJobData = {
	type: 'exportClips';
	user: ThinUser;
};

export type DbExportFavoritesJobData = {
	type: 'exportFavorites';
	user: ThinUser;
};

export type DbExportFollowingJobData = {
	type: 'exportFollowing';
	user: ThinUser;
	excludeMuting: boolean;
	excludeInactive: boolean;
};

export type DbExportMutingJobData = {
	type: 'exportMuting';
	user: ThinUser;
};

export type DbExportBlockingJobData = {
	type: 'exportBlocking';
	user: ThinUser;
};

export type DbExportUserListsJobData = {
	type: 'exportUserLists';
	user: ThinUser;
};

export type ImportAntenna = MiAntenna & { userListAccts: string[] | null };

export type DbImportAntennasJobData = {
	type: 'importAntennas';
	user: ThinUser;
	antennas: ImportAntenna[];
	fileId: MiDriveFile['id'];
} | {
	type: 'importAntennas';
	user: ThinUser;
	antenna: ImportAntenna[];
	fileId: MiDriveFile['id'];
};

export type DbImportNotesJobData =
	DbNoteImportFromMisskeyJobData |
	DbNoteImportFromMastodonJobData |
	DbNoteImportFromPleromaJobData |
	DbNoteImportFromTwitterJobData |
	DbNoteImportFromInstagramJobData |
	DbNoteImportFromFacebookJobData;

export type DbNoteImportFromMisskeyJobData = {
	type: 'importNotes';
	source: 'Misskey';
	user: ThinUser;
	fileId: MiDriveFile['id'];
};

export type DbNoteImportFromMastodonJobData = {
	type: 'importNotes';
	source: 'Mastodon';
	user: ThinUser;
	fileId: MiDriveFile['id'];
};

export type DbNoteImportFromPleromaJobData = {
	type: 'importNotes';
	source: 'Pleroma';
	user: ThinUser;
	fileId: MiDriveFile['id'];
};

export type DbNoteImportFromTwitterJobData = {
	type: 'importNotes';
	source: 'Twitter';
	user: ThinUser;
	fileId: MiDriveFile['id'];
};

export type DbNoteImportFromInstagramJobData = {
	type: 'importNotes';
	source: 'Instagram';
	user: ThinUser;
	fileId: MiDriveFile['id'];
};

export type DbNoteImportFromFacebookJobData = {
	type: 'importNotes';
	source: 'Facebook';
	user: ThinUser;
	fileId: MiDriveFile['id'];
};

export type DbImportTweetsToDbJobData = {
	type: 'importTweetsToDb';
	user: ThinUser;
	target: FIXME;
	note?: MiNote['id'] | null;
};

export type DbImportIGToDbJobData = {
	type: 'importIGToDb';
	user: ThinUser;
	target: FIXME;
	note?: MiNote['id'] | null;
};

export type DbImportFBToDbJobData = {
	type: 'importFBToDb';
	user: ThinUser;
	target: FIXME;
	note?: MiNote['id'] | null;
};

export type DbImportMastoToDbJobData = {
	type: 'importMastoToDb';
	user: ThinUser;
	target: FIXME;
	note?: MiNote['id'] | null;
};

export type DbImportPleroToDbJobData = {
	type: 'importPleroToDb';
	user: ThinUser;
	target: FIXME;
	note?: MiNote['id'] | null;
};

export type DbImportKeyNotesToDbJobData = {
	type: 'importKeyNotesToDb';
	user: ThinUser;
	target: FIXME;
	note?: MiNote['id'] | null;
};

export type DbImportFollowingJobData = {
	type: 'importFollowing';
	user: ThinUser;
	fileId: MiDriveFile['id'];
	withReplies?: boolean;
};

export type DbImportFollowingToDbJobData = {
	type: 'importFollowingToDb';
	user: ThinUser;
	target: string;
	withReplies?: boolean;
};

export type DbImportMutingJobData = {
	type: 'importMuting';
	user: ThinUser;
	fileId: MiDriveFile['id'];
};

export type DbImportBlockingJobData = {
	type: 'importBlocking';
	user: ThinUser;
	fileId: MiDriveFile['id'];
};

export type DbImportBlockingToDbJobData = {
	type: 'importBlockingToDb';
	user: ThinUser;
	target: string;
};

export type DbImportUserListsJobData = {
	type: 'importUserLists';
	user: ThinUser;
	fileId: MiDriveFile['id'];
};

export type DbImportCustomEmojisJobData = {
	type: 'importCustomEmojis';
	user: ThinUser;
	fileId: MiDriveFile['id'];
};

export type DbDeleteAccountJobData = {
	type: 'deleteAccount';
	user: ThinUser;
	soft?: boolean;
};

export type ObjectStorageJobData = ObjectStorageFileJobData | CleanRemoteFilesJobData;

export type ObjectStorageFileJobData = {
	type: 'deleteFile';
	key: string;
};

export type EndedPollNotificationJobData = {
	noteId: MiNote['id'];
};

export type SystemWebhookDeliverJobData<T extends SystemWebhookEventType = SystemWebhookEventType> = {
	type: T;
	content: SystemWebhookPayload<T>;
	webhookId: MiWebhook['id'];
	to: string;
	secret: string;
	createdAt: number;
	eventId: string;
};

export type UserWebhookDeliverJobData<T extends WebhookEventTypes = WebhookEventTypes> = {
	type: T;
	content: UserWebhookPayload<T>;
	webhookId: MiWebhook['id'];
	userId: MiUser['id'];
	to: string;
	secret: string;
	createdAt: number;
	eventId: string;
};

export type ThinUser = {
	id: MiUser['id'];
};

export type ScheduleNotePostJobData = {
	scheduleNoteId: MiNote['id'];
};

export type BackgroundTaskJobData =
	UpdateUserBackgroundTask |
	UpdateFeaturedBackgroundTask |
	UpdateUserTagsBackgroundTask |
	UpdateNoteTagsBackgroundTask |
	UpdateInstanceBackgroundTask |
	PostDeliverBackgroundTask |
	PostInboxBackgroundTask |
	PostNoteBackgroundTask |
	DeleteFileBackgroundTask |
	UpdateLatestNoteBackgroundTask |
	PostSuspendBackgroundTask |
	PostUnsuspendBackgroundTask |
	DeleteApLogsBackgroundTask;

export type UpdateUserBackgroundTask = {
	type: 'update-user';
	userId: string;
};

export type UpdateFeaturedBackgroundTask = {
	type: 'update-featured';
	userId: string;
};

export type UpdateUserTagsBackgroundTask = {
	type: 'update-user-tags';
	userId: string;
};

export type UpdateNoteTagsBackgroundTask = {
	type: 'update-note-tags';
	noteId: string;
};

export type UpdateInstanceBackgroundTask = {
	type: 'update-instance';
	host: string;
};

export type PostDeliverBackgroundTask = {
	type: 'post-deliver';
	host: string;
	result: 'success' | 'temp-fail' | 'perm-fail';
};

export type PostInboxBackgroundTask = {
	type: 'post-inbox';
	host: string;
};

export type PostNoteBackgroundTask = {
	type: 'post-note';
	noteId: string;
	silent: boolean;
	edit: boolean;
};

export type DeleteFileBackgroundTask = {
	type: 'delete-file';
	fileId: string;
	isExpired?: boolean;
	deleterId?: string;
};

export type UpdateLatestNoteBackgroundTask = {
	type: 'update-latest-note';
	note: MinimalNote;
};

export type PostSuspendBackgroundTask = {
	type: 'post-suspend';
	userId: string;
};

export type PostUnsuspendBackgroundTask = {
	type: 'post-unsuspend';
	userId: string;
};

export type DeleteApLogsBackgroundTask = {
	type: 'delete-ap-logs';
	dataType: 'inbox' | 'object';
	data: string | string[];
};
