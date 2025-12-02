/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Antenna } from '@/server/api/endpoints/i/import-antennas.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import type { SystemWebhookEventType } from '@/models/SystemWebhook.js';
import type { MiUser } from '@/models/User.js';
import type { MiWebhook, WebhookEventTypes } from '@/models/Webhook.js';
import type { IActivity } from '@/core/activitypub/type.js';
import type { SystemWebhookPayload } from '@/core/SystemWebhookService.js';
import type { UserWebhookPayload } from '@/core/UserWebhookService.js';
import type { MinimalNote } from '@/misc/is-renote.js';
import type httpSignature from '@peertube/http-signature';

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

export type InboxJobData = {
	activity: IActivity;
	signature: httpSignature.IParsedSignature;
};

export type RelationshipJobData = {
	from: ThinUser;
	to: ThinUser;
	silent?: boolean;
	requestId?: string;
	withReplies?: boolean;
};

export type CleanRemoteFilesJobData = {
	keepFilesInUse: boolean;
	olderThanSeconds: number;
};

export type DbJobData<T extends keyof DbJobMap> = DbJobMap[T];

export type DbJobMap = {
	deleteDriveFiles: DbJobDataWithUser;
	exportAccountData: DbJobDataWithUser;
	exportCustomEmojis: DbJobDataWithUser;
	exportAntennas: DBExportAntennasData;
	exportNotes: DbJobDataWithUser;
	exportFavorites: DbJobDataWithUser;
	exportFollowing: DbExportFollowingData;
	exportMuting: DbJobDataWithUser;
	exportBlocking: DbJobDataWithUser;
	exportUserLists: DbJobDataWithUser;
	importAntennas: DBAntennaImportJobData;
	importNotes: DbNoteImportJobData;
	importTweetsToDb: DbNoteWithParentImportToDbJobData;
	importIGToDb: DbNoteImportToDbJobData;
	importFBToDb: DbNoteImportToDbJobData;
	importMastoToDb: DbNoteWithParentImportToDbJobData;
	importPleroToDb: DbNoteWithParentImportToDbJobData;
	importKeyNotesToDb: DbNoteWithParentImportToDbJobData;
	importFollowing: DbUserImportJobData;
	importFollowingToDb: DbUserImportToDbJobData;
	importMuting: DbUserImportJobData;
	importBlocking: DbUserImportJobData;
	importBlockingToDb: DbUserImportToDbJobData;
	importUserLists: DbUserImportJobData;
	importCustomEmojis: DbUserImportJobData;
	deleteAccount: DbUserDeleteJobData;
};

export type DbJobDataWithUser = {
	user: ThinUser;
};

export type DbExportFollowingData = {
	user: ThinUser;
	excludeMuting: boolean;
	excludeInactive: boolean;
};

export type DBExportAntennasData = {
	user: ThinUser
};

export type DbUserDeleteJobData = {
	user: ThinUser;
	soft?: boolean;
};

export type DbUserImportJobData = {
	user: ThinUser;
	fileId: MiDriveFile['id'];
	withReplies?: boolean;
};

export type DbNoteImportJobData = {
	user: ThinUser;
	fileId: MiDriveFile['id'];
	type?: string;
};

export type DBAntennaImportJobData = {
	user: ThinUser,
	antenna: Antenna
	fileId: MiDriveFile['id'];
};

export type DbUserImportToDbJobData = {
	user: ThinUser;
	target: string;
	withReplies?: boolean;
};

export type DbNoteImportToDbJobData = {
	user: ThinUser;
	target: any;
};

export type DbNoteWithParentImportToDbJobData = {
	user: ThinUser;
	target: any;
	note: MiNote['id'] | null;
};

export type ObjectStorageJobData = ObjectStorageFileJobData | Record<string, unknown>;

export type ObjectStorageFileJobData = {
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

export type CheckHibernationBackgroundTask = {
	type: 'check-hibernation';
	userId: string;
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
