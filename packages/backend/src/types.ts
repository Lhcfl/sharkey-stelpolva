/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * note - 通知オンにしているユーザーが投稿した
 * follow - フォローされた
 * mention - 投稿で自分が言及された
 * reply - 投稿に返信された
 * renote - 投稿がRenoteされた
 * quote - 投稿が引用Renoteされた
 * reaction - 投稿にリアクションされた
 * pollEnded - 自分のアンケートもしくは自分が投票したアンケートが終了した
 * receiveFollowRequest - フォローリクエストされた
 * followRequestAccepted - 自分の送ったフォローリクエストが承認された
 * roleAssigned - ロールが付与された
 * chatRoomInvitationReceived - チャットルームに招待された
 * achievementEarned - 実績を獲得
 * exportCompleted - エクスポートが完了
 * login - ログイン
 * createToken - トークン作成
 * app - アプリ通知
 * test - テスト通知（サーバー側）
 */
export const notificationTypes = [
	'note',
	'follow',
	'mention',
	'reply',
	'renote',
	'quote',
	'reaction',
	'pollEnded',
	'edited',
	'receiveFollowRequest',
	'followRequestAccepted',
	'roleAssigned',
	'chatRoomInvitationReceived',
	'achievementEarned',
	'exportCompleted',
	'importCompleted',
	'login',
	'createToken',
	'scheduledNoteFailed',
	'scheduledNotePosted',
	'app',
	'test',
	'reportAccepted',
	'sharedAccessGranted',
	'sharedAccessRevoked',
	'sharedAccessLogin',
] as const;

export const groupedNotificationTypes = [
	...notificationTypes,
	'reaction:grouped',
	'renote:grouped',
] as const;

export const obsoleteNotificationTypes = ['pollVote', 'groupInvited'] as const;

export const noteVisibilities = ['public', 'home', 'followers', 'specified'] as const;

export const mutedNoteReasons = ['word', 'manual', 'spam', 'other'] as const;

export const followingVisibilities = ['public', 'followers', 'private'] as const;
export const followersVisibilities = ['public', 'followers', 'private'] as const;

export const defaultCWPriorities = ['default', 'parent', 'defaultParent', 'parentDefault'] as const;

/**
 * ユーザーがエクスポートできるものの種類
 *
 * （主にエクスポート完了通知で使用するものであり、既存のDBの名称等と必ずしも一致しない）
 */
export const userExportableEntities = ['antenna', 'blocking', 'clip', 'customEmoji', 'favorite', 'following', 'muting', 'note', 'userList'] as const;

/**
 * ユーザーがインポートできるものの種類
 *
 * （主にインポート完了通知で使用するものであり、既存のDBの名称等と必ずしも一致しない）
 */
export const userImportableEntities = ['antenna', 'blocking', 'customEmoji', 'following', 'muting', 'userList'] as const;

export const moderationLogTypes = [
	'updateServerSettings',
	'suspend',
	'approve',
	'decline',
	'unsuspend',
	'updateUserNote',
	'addCustomEmoji',
	'updateCustomEmoji',
	'deleteCustomEmoji',
	'assignRole',
	'unassignRole',
	'createRole',
	'updateRole',
	'deleteRole',
	'clearQueue',
	'promoteQueue',
	'deleteDriveFile',
	'deleteNote',
	'makePrivateNote',
	'createGlobalAnnouncement',
	'createUserAnnouncement',
	'updateGlobalAnnouncement',
	'updateUserAnnouncement',
	'deleteGlobalAnnouncement',
	'deleteUserAnnouncement',
	'resetPassword',
	'restartMigration',
	'setMandatoryCW',
	'setMandatoryCWForNote',
	'setMandatoryCWForInstance',
	'suspendRemoteInstance',
	'unsuspendRemoteInstance',
	'rejectRemoteInstanceReports',
	'acceptRemoteInstanceReports',
	'updateRemoteInstanceNote',
	'markSensitiveDriveFile',
	'unmarkSensitiveDriveFile',
	'resolveAbuseReport',
	'forwardAbuseReport',
	'updateAbuseReportNote',
	'createInvitation',
	'createAd',
	'updateAd',
	'deleteAd',
	'createAvatarDecoration',
	'updateAvatarDecoration',
	'deleteAvatarDecoration',
	'unsetUserAvatar',
	'unsetUserBanner',
	'createSystemWebhook',
	'updateSystemWebhook',
	'deleteSystemWebhook',
	'createAbuseReportNotificationRecipient',
	'updateAbuseReportNotificationRecipient',
	'deleteAbuseReportNotificationRecipient',
	'deleteAccount',
	'deletePage',
	'deleteFlash',
	'deleteGalleryPost',
	'deleteChatRoom',
	'acceptQuotesUser',
	'rejectQuotesUser',
	'acceptQuotesInstance',
	'rejectQuotesInstance',
	'clearUserFiles',
	'nsfwUser',
	'unNsfwUser',
	'silenceUser',
	'unSilenceUser',
	'createAccount',
	'clearRemoteFiles',
	'clearOwnerlessFiles',
	'updateCustomEmojis',
	'importCustomEmojis',
	'clearInstanceFiles',
	'severFollowRelations',
	'createPromo',
	'addRelay',
	'removeRelay',
	'updateProxyAccountDescription',
	'setRoot',
] as const;

export type ModerationLogPayloads = {
	updateServerSettings: {
		before: any | null;
		after: any | null;
	};
	suspend: {
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	approve: {
		userId: string;
		userUsername: string;
		userHost: string | null;
		reason?: string | null;
	};
	decline: {
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	unsuspend: {
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	updateUserNote: {
		userId: string;
		userUsername: string;
		userHost: string | null;
		before: string | null;
		after: string | null;
	};
	addCustomEmoji: {
		emojiId: string;
		emoji: any;
	};
	updateCustomEmoji: {
		emojiId: string;
		before: any;
		after: any;
	};
	deleteCustomEmoji: {
		emojiId: string;
		emoji: any;
	};
	assignRole: {
		userId: string;
		userUsername: string;
		userHost: string | null;
		roleId: string;
		roleName: string;
		expiresAt: string | null;
	};
	unassignRole: {
		userId: string;
		userUsername: string;
		userHost: string | null;
		roleId: string;
		roleName: string;
	};
	createRole: {
		roleId: string;
		role: any;
	};
	updateRole: {
		roleId: string;
		before: any;
		after: any;
	};
	deleteRole: {
		roleId: string;
		role: any;
	};
	clearQueue: Record<string, never>;
	promoteQueue: Record<string, never>;
	deleteDriveFile: {
		fileId: string;
		fileUserId: string | null;
		fileUserUsername: string | null;
		fileUserHost: string | null;
	};
	deleteNote: {
		noteId: string;
		noteUserId: string;
		noteUserUsername: string;
		noteUserHost: string | null;
	};
	makePrivateNote: {
		noteId: string;
		noteUserId: string;
		noteUserUsername: string;
		noteUserHost: string | null;
	}
	createGlobalAnnouncement: {
		announcementId: string;
		announcement: any;
	};
	createUserAnnouncement: {
		announcementId: string;
		announcement: any;
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	updateGlobalAnnouncement: {
		announcementId: string;
		before: any;
		after: any;
	};
	updateUserAnnouncement: {
		announcementId: string;
		before: any;
		after: any;
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	deleteGlobalAnnouncement: {
		announcementId: string;
		announcement: any;
	};
	deleteUserAnnouncement: {
		announcementId: string;
		announcement: any;
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	resetPassword: {
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	restartMigration: {
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	setMandatoryCW: {
		newCW: string | null;
		oldCW: string | null;
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	setMandatoryCWForNote: {
		newCW: string | null;
		oldCW: string | null;
		noteId: string;
		noteUserId: string;
		noteUserUsername: string;
		noteUserHost: string | null;
	};
	setMandatoryCWForInstance: {
		newCW: string | null;
		oldCW: string | null;
		host: string;
	};
	suspendRemoteInstance: {
		id: string;
		host: string;
	};
	unsuspendRemoteInstance: {
		id: string;
		host: string;
	};
	rejectRemoteInstanceReports: {
		id: string;
		host: string;
	};
	acceptRemoteInstanceReports: {
		id: string;
		host: string;
	};
	updateRemoteInstanceNote: {
		id: string;
		host: string;
		before: string | null;
		after: string | null;
	};
	markSensitiveDriveFile: {
		fileId: string;
		fileUserId: string | null;
		fileUserUsername: string | null;
		fileUserHost: string | null;
	};
	unmarkSensitiveDriveFile: {
		fileId: string;
		fileUserId: string | null;
		fileUserUsername: string | null;
		fileUserHost: string | null;
	};
	resolveAbuseReport: {
		reportId: string;
		report: any;
		forwarded?: boolean;
		resolvedAs?: string | null;
	};
	forwardAbuseReport: {
		reportId: string;
		report: any;
	};
	updateAbuseReportNote: {
		reportId: string;
		report: any;
		before: string;
		after: string;
	};
	createInvitation: {
		invitations: any[];
	};
	createAd: {
		adId: string;
		ad: any;
	};
	updateAd: {
		adId: string;
		before: any;
		after: any;
	};
	deleteAd: {
		adId: string;
		ad: any;
	};
	createAvatarDecoration: {
		avatarDecorationId: string;
		avatarDecoration: any;
	};
	updateAvatarDecoration: {
		avatarDecorationId: string;
		before: any;
		after: any;
	};
	deleteAvatarDecoration: {
		avatarDecorationId: string;
		avatarDecoration: any;
	};
	unsetUserAvatar: {
		userId: string;
		userUsername: string;
		userHost: string | null;
		fileId: string;
	};
	unsetUserBanner: {
		userId: string;
		userUsername: string;
		userHost: string | null;
		fileId: string;
	};
	createSystemWebhook: {
		systemWebhookId: string;
		webhook: any;
	};
	updateSystemWebhook: {
		systemWebhookId: string;
		before: any;
		after: any;
	};
	deleteSystemWebhook: {
		systemWebhookId: string;
		webhook: any;
	};
	createAbuseReportNotificationRecipient: {
		recipientId: string;
		recipient: any;
	};
	updateAbuseReportNotificationRecipient: {
		recipientId: string;
		before: any;
		after: any;
	};
	deleteAbuseReportNotificationRecipient: {
		recipientId: string;
		recipient: any;
	};
	deleteAccount: {
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	deletePage: {
		pageId: string;
		pageUserId: string;
		pageUserUsername: string;
	};
	deleteFlash: {
		flashId: string;
		flashUserId: string;
		flashUserUsername: string;
	};
	deleteGalleryPost: {
		postId: string;
		postUserId: string;
		postUserUsername: string;
	};
	acceptQuotesUser: {
		userId: string,
		userUsername: string,
		userHost: string | null,
	};
	rejectQuotesUser: {
		userId: string,
		userUsername: string,
		userHost: string | null,
	};
	acceptQuotesInstance: {
		id: string;
		host: string;
	};
	rejectQuotesInstance: {
		id: string;
		host: string;
	};
	deleteChatRoom: {
		roomId: string;
		room: any;
	};
	updateProxyAccountDescription: {
		before: string | null;
		after: string | null;
	};
	clearUserFiles: {
		userId: string;
		userUsername: string;
		userHost: string | null;
		count: number;
	};
	nsfwUser: {
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	unNsfwUser: {
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	silenceUser: {
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	unSilenceUser: {
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	createAccount: {
		userId: string;
		userUsername: string;
	};
	clearRemoteFiles: Record<string, never>;
	clearOwnerlessFiles: {
		count: number;
	};
	updateCustomEmojis: {
		ids: string[],
		category?: string | null,
		license?: string | null,
		setAliases?: string[],
		addAliases?: string[],
		delAliases?: string[],
	},
	importCustomEmojis: {
		fileName: string,
	},
	clearInstanceFiles: {
		host: string;
		count: number;
	},
	severFollowRelations: {
		host: string;
	},
	createPromo: {
		noteId: string,
		noteUserId: string;
		noteUserUsername: string;
		noteUserHost: string | null;
	},
	addRelay: {
		inbox: string;
	},
	removeRelay: {
		inbox: string;
	},
	setRoot: {
		before: {
			userId: string;
			userUsername: string;
		};
		after: {
			userId: string;
			userUsername: string;
		};
	},
};

export type Serialized<T> = {
	[K in keyof T]:
	T[K] extends Date
		? string
		: T[K] extends (Date | null)
			? (string | null)
			: T[K] extends (Date | undefined)
				? (string | undefined)
				: T[K] extends (Date | null | undefined)
					? (string | null | undefined)
					: T[K] extends Record<string, any>
						? Serialized<T[K]>
						: T[K] extends (Record<string, any> | null)
							? (Serialized<T[K]> | null)
							: T[K] extends (Record<string, any> | undefined)
								? (Serialized<T[K]> | undefined)
								: T[K];
};

export type FilterUnionByProperty<
	Union,
	Property extends string | number | symbol,
	Condition,
> = Union extends Record<Property, Condition> ? Union : never;

/**
 * Strip index signatures from type T, leaving only explicitly-declared properties.
 */
export type OmitIndexSignature<T> = {
	[K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

/**
 * General-purpose Option type with support for strongly-typed errors.
 * Useful when code needs to abort with an error, but exceptions (Error) would be inappropriate.
 */
export type Result<TResult, TError = unknown> = SuccessResult<TResult> | ErrorResult<TError>;

type SuccessResult<TResult> = { result: TResult, error?: undefined };
type ErrorResult<TError> = { result?: undefined, error: TError };

/**
 * Converts a union type (A | B | C) into an intersection type (A & B & C);
 * Adapted from the wizardry at https://stackoverflow.com/a/50375286
 */
export type UnionToIntersection<T> = (T extends unknown ? (x: T) => void : never) extends ((x: infer I) => void) ? I : never;

/**
 * Converts a union type (A | B | C) into an interface type (Partial<{ ...a, ...b, ...c }>)>
 */
export type UnionToInterface<T> = {
	[K in keyof UnionToIntersection<T>]: UnionToIntersection<T>[K];
};

/**
 * Represents the empty object - {}
 */
export type EmptyObject = Record<string, never>;

/**
 * Creates a "partially partial" type from T, where all keys in P are optional and the rest are required.
 */
export type SemiPartial<T, P extends keyof T> = Omit<T, P> & {
	[Key in P]?: T[Key] | undefined;
};

/**
 * Returns the input type T with all nullable properties converted to optional.
 */
export type NullableToOptional<T> = Omit<T, NullableKeys<T>> & {
	[K in NullableKeys<T>]?: T[K] | undefined;
};

/**
 * Extracts the keys from T where the value is permitted to be "null".
 */
export type NullableKeys<T> = {
	[K in keyof T]: null extends T[K] ? K : never;
}[keyof T];
