import type { operations } from './autogen/types.js';
import type {
	AbuseReportNotificationRecipient,
	Ad,
	Announcement,
	EmojiDetailed,
	InviteCode,
	MetaDetailed,
	Role,
	ReversiGameDetailed,
	SystemWebhook,
	UserLite,
	ChatRoom,
} from './autogen/models.js';

export const notificationTypes = ['note', 'follow', 'mention', 'reply', 'renote', 'quote', 'reaction', 'pollVote', 'pollEnded', 'receiveFollowRequest', 'followRequestAccepted', 'groupInvited', 'app', 'roleAssigned', 'chatRoomInvitationReceived', 'achievementEarned', 'edited', 'scheduledNoteFailed', 'scheduledNotePosted'] as const;

export const noteVisibilities = ['public', 'home', 'followers', 'specified'] as const;

export const mutedNoteReasons = ['word', 'manual', 'spam', 'other'] as const;

export const followingVisibilities = ['public', 'followers', 'private'] as const;

export const followersVisibilities = ['public', 'followers', 'private'] as const;

export const permissions = [
	'read:account',
	'write:account',
	'read:blocks',
	'write:blocks',
	'read:drive',
	'write:drive',
	'read:favorites',
	'write:favorites',
	'read:following',
	'write:following',
	'read:messaging', // deprecated
	'write:messaging', // deprecated
	'read:mutes',
	'write:mutes',
	'write:notes',
	'read:notes-schedule',
	'write:notes-schedule',
	'read:notifications',
	'write:notifications',
	'read:reactions',
	'write:reactions',
	'write:votes',
	'read:pages',
	'write:pages',
	'write:page-likes',
	'read:page-likes',
	'read:user-groups',
	'write:user-groups',
	'read:channels',
	'write:channels',
	'read:gallery',
	'write:gallery',
	'read:gallery-likes',
	'write:gallery-likes',
	'read:flash',
	'write:flash',
	'read:flash-likes',
	'write:flash-likes',
	'read:admin:abuse-user-reports',
	'write:admin:delete-account',
	'write:admin:delete-all-files-of-a-user',
	'read:admin:index-stats',
	'read:admin:table-stats',
	'read:admin:user-ips',
	'read:admin:meta',
	'write:admin:reset-password',
	'write:admin:resolve-abuse-user-report',
	'write:admin:send-email',
	'read:admin:server-info',
	'read:admin:show-moderation-log',
	'read:admin:show-user',
	'write:admin:suspend-user',
	'write:admin:approve-user',
	'write:admin:decline-user',
	'write:admin:nsfw-user',
	'write:admin:unnsfw-user',
	'write:admin:cw-user',
	'write:admin:silence-user',
	'write:admin:unsilence-user',
	'write:admin:unset-user-avatar',
	'write:admin:unset-user-banner',
	'write:admin:unsuspend-user',
	'write:admin:reject-quotes',
	'write:admin:meta',
	'write:admin:user-note',
	'write:admin:roles',
	'read:admin:roles',
	'write:admin:relays',
	'read:admin:relays',
	'write:admin:invite-codes',
	'read:admin:invite-codes',
	'write:admin:announcements',
	'read:admin:announcements',
	'write:admin:avatar-decorations',
	'read:admin:avatar-decorations',
	'write:admin:federation',
	'write:admin:account',
	'read:admin:account',
	'write:admin:emoji',
	'read:admin:emoji',
	'write:admin:queue',
	'read:admin:queue',
	'write:admin:promo',
	'write:admin:drive',
	'read:admin:drive',
	'write:admin:ad',
	'read:admin:ad',
	'write:invite-codes',
	'read:invite-codes',
	'write:clip-favorite',
	'read:clip-favorite',
	'read:federation',
	'write:report-abuse',
	'write:chat',
	'read:chat',
] as const;

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
	'createGlobalAnnouncement',
	'createUserAnnouncement',
	'updateGlobalAnnouncement',
	'updateUserAnnouncement',
	'deleteGlobalAnnouncement',
	'deleteUserAnnouncement',
	'resetPassword',
	'setMandatoryCW',
	'setRemoteInstanceNSFW',
	'unsetRemoteInstanceNSFW',
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
] as const;

// See: packages/backend/src/core/ReversiService.ts@L410
export const reversiUpdateKeys = [
	'map',
	'bw',
	'isLlotheo',
	'canPutEverywhere',
	'loopedBoard',
	'timeLimitForEachTurn',
] as const satisfies (keyof ReversiGameDetailed)[];

export type ReversiUpdateKey = typeof reversiUpdateKeys[number];

interface AvatarDecoration {
	id: string;
	updatedAt: string | null;
	url: string;
	name: string;
	description: string;
	roleIdsThatCanBeUsedThisDecoration: string[];
}

type ReceivedAbuseReport = {
	reportId: AbuseReportNotificationRecipient['id'];
	report: operations['admin___abuse-user-reports']['responses'][200]['content']['application/json'];
	forwarded: boolean;
};

export type ModerationLogPayloads = {
	updateServerSettings: {
		before: MetaDetailed | null;
		after: MetaDetailed | null;
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
		emoji: EmojiDetailed;
	};
	updateCustomEmoji: {
		emojiId: string;
		before: EmojiDetailed;
		after: EmojiDetailed;
	};
	deleteCustomEmoji: {
		emojiId: string;
		emoji: EmojiDetailed;
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
		role: Role;
	};
	updateRole: {
		roleId: string;
		before: Role;
		after: Role;
	};
	deleteRole: {
		roleId: string;
		role: Role;
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
	createGlobalAnnouncement: {
		announcementId: string;
		announcement: Announcement;
	};
	createUserAnnouncement: {
		announcementId: string;
		announcement: Announcement;
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	updateGlobalAnnouncement: {
		announcementId: string;
		before: Announcement;
		after: Announcement;
	};
	updateUserAnnouncement: {
		announcementId: string;
		before: Announcement;
		after: Announcement;
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	deleteGlobalAnnouncement: {
		announcementId: string;
		announcement: Announcement;
	};
	deleteUserAnnouncement: {
		announcementId: string;
		announcement: Announcement;
		userId: string;
		userUsername: string;
		userHost: string | null;
	};
	resetPassword: {
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
	setRemoteInstanceNSFW: {
		id: string;
		host: string;
	};
	unsetRemoteInstanceNSFW: {
		id: string;
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
		report: ReceivedAbuseReport;
		forwarded?: boolean;
		resolvedAs?: string | null;
	};
	forwardAbuseReport: {
		reportId: string;
		report: ReceivedAbuseReport;
	};
	updateAbuseReportNote: {
		reportId: string;
		report: ReceivedAbuseReport;
		before: string;
		after: string;
	};
	createInvitation: {
		invitations: InviteCode[];
	};
	createAd: {
		adId: string;
		ad: Ad;
	};
	updateAd: {
		adId: string;
		before: Ad;
		after: Ad;
	};
	deleteAd: {
		adId: string;
		ad: Ad;
	};
	createAvatarDecoration: {
		avatarDecorationId: string;
		avatarDecoration: AvatarDecoration;
	};
	updateAvatarDecoration: {
		avatarDecorationId: string;
		before: AvatarDecoration;
		after: AvatarDecoration;
	};
	deleteAvatarDecoration: {
		avatarDecorationId: string;
		avatarDecoration: AvatarDecoration;
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
		webhook: SystemWebhook;
	};
	updateSystemWebhook: {
		systemWebhookId: string;
		before: SystemWebhook;
		after: SystemWebhook;
	};
	deleteSystemWebhook: {
		systemWebhookId: string;
		webhook: SystemWebhook;
	};
	createAbuseReportNotificationRecipient: {
		recipientId: string;
		recipient: AbuseReportNotificationRecipient;
	};
	updateAbuseReportNotificationRecipient: {
		recipientId: string;
		before: AbuseReportNotificationRecipient;
		after: AbuseReportNotificationRecipient;
	};
	deleteAbuseReportNotificationRecipient: {
		recipientId: string;
		recipient: AbuseReportNotificationRecipient;
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
	};
	importCustomEmojis: {
		fileName: string,
	};
	clearInstanceFiles: {
		host: string;
		count: number;
	};
	severFollowRelations: {
		host: string;
	};
	createPromo: {
		noteId: string,
		noteUserId: string;
		noteUserUsername: string;
		noteUserHost: string | null;
	};
	addRelay: {
		inbox: string;
	};
	removeRelay: {
		inbox: string;
	};
	deleteChatRoom: {
		roomId: string;
		room: ChatRoom;
	};
};
