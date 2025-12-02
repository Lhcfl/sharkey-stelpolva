/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import * as Reversi from 'misskey-reversi';
import type { MiChannel } from '@/models/Channel.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import type { MiNote } from '@/models/Note.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiDriveFolder } from '@/models/DriveFolder.js';
import type { MiUserList } from '@/models/UserList.js';
import type { MiAbuseUserReport } from '@/models/AbuseUserReport.js';
import type { MiSignin } from '@/models/Signin.js';
import type { MiPage } from '@/models/Page.js';
import type { MiWebhook } from '@/models/Webhook.js';
import type { MiSystemWebhook } from '@/models/SystemWebhook.js';
import type { MiMeta } from '@/models/Meta.js';
import type { MiAvatarDecoration, MiChatMessage, MiChatRoom, MiReversiGame, MiRole, MiRoleAssignment } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';
import type { Serialized } from '@/types.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import type Emitter from 'strict-event-emitter-types';
import type { EventEmitter } from 'events';

//#region Stream type-body definitions
export interface BroadcastTypes {
	emojiAdded: {
		emoji: Packed<'EmojiDetailed'>;
	};
	emojiUpdated: {
		emojis: Packed<'EmojiDetailed'>[];
	};
	emojiDeleted: {
		emojis: {
			id?: string;
			name: string;
			[other: string]: any;
		}[];
	};
	announcementCreated: {
		announcement: Packed<'Announcement'>;
	};
}

export interface MainEventTypes {
	notification: Packed<'Notification'>;
	mention: Packed<'Note'>;
	reply: Packed<'Note'>;
	renote: Packed<'Note'>;
	follow: Packed<'UserDetailedNotMe'>;
	followed: Packed<'UserLite'>;
	unfollow: Packed<'UserDetailedNotMe'>;
	meUpdated: Packed<'MeDetailed'>;
	pageEvent: {
		pageId: MiPage['id'];
		event: string;
		var: any;
		userId: MiUser['id'];
		user: Packed<'UserDetailed'>;
	};
	urlUploadFinished: {
		marker?: string | null;
		file: Packed<'DriveFile'>;
	};
	readAllNotifications: undefined;
	notificationFlushed: undefined;
	unreadNotification: Packed<'Notification'>;
	unreadAntenna: MiAntenna;
	newChatMessage: Packed<'ChatMessage'>;
	readAllAnnouncements: undefined;
	myTokenRegenerated: undefined;
	signin: {
		id: MiSignin['id'];
		createdAt: string;
		ip: string;
		headers: Record<string, any>;
		success: boolean;
	};
	registryUpdated: {
		scope?: string[];
		key: string;
		value: any | null;
	};
	driveFileCreated: Packed<'DriveFile'>;
	readAntenna: MiAntenna;
	receiveFollowRequest: Packed<'UserLite'>;
	announcementCreated: {
		announcement: Packed<'Announcement'>;
	};
	edited: Packed<'Note'>;
}

export interface DriveEventTypes {
	fileCreated: Packed<'DriveFile'>;
	fileDeleted: MiDriveFile['id'];
	fileUpdated: Packed<'DriveFile'>;
	folderCreated: Packed<'DriveFolder'>;
	folderDeleted: MiDriveFolder['id'];
	folderUpdated: Packed<'DriveFolder'>;
}

export interface NoteEventTypes {
	pollVoted: {
		choice: number;
		userId: MiUser['id'];
	};
	deleted: {
		deletedAt: Date;
	};
	updated: {
		cw: string | null;
		text: string;
	};
	reacted: {
		reaction: string;
		emoji?: {
			name: string;
			url: string;
		} | null;
		userId: MiUser['id'];
	};
	unreacted: {
		reaction: string;
		userId: MiUser['id'];
	};
	replied: {
		id: MiNote['id'];
		userId: MiUser['id'];
	};
	madePrivate: {
		deletedAt: Date;
	}
}
type NoteStreamEventTypes = {
	[key in keyof NoteEventTypes]: {
		id: MiNote['id'];
		body: NoteEventTypes[key];
	};
};

export interface UserListEventTypes {
	userAdded: Packed<'UserLite'>;
	userRemoved: Packed<'UserLite'>;
}

export interface AntennaEventTypes {
	note: MiNote;
}

export interface RoleTimelineEventTypes {
	note: Packed<'Note'>;
}

export interface AdminEventTypes {
	newAbuseUserReport: {
		id: MiAbuseUserReport['id'];
		targetUserId: MiUser['id'],
		reporterId: MiUser['id'],
		comment: string;
	};
}

export interface ChatEventTypes {
	message: Packed<'ChatMessageLite'>;
	deleted: Packed<'ChatMessageLite'>['id'];
	react: {
		reaction: string;
		user?: Packed<'UserLite'>;
		messageId: MiChatMessage['id'];
	};
	unreact: {
		reaction: string;
		user?: Packed<'UserLite'>;
		messageId: MiChatMessage['id'];
	};
}

export interface ReversiEventTypes {
	matched: {
		game: Packed<'ReversiGameDetailed'>;
	};
	invited: {
		user: Packed<'User'>;
	};
}

export interface ReversiGameEventTypes {
	changeReadyStates: {
		user1: boolean;
		user2: boolean;
	};
	updateSettings: {
		userId: MiUser['id'];
		key: string;
		value: any;
	};
	log: Reversi.Serializer.Log & { id: string | null };
	started: {
		game: Packed<'ReversiGameDetailed'>;
	};
	ended: {
		winnerId: MiUser['id'] | null;
		game: Packed<'ReversiGameDetailed'>;
	};
	canceled: {
		userId: MiUser['id'];
	};
}
//#endregion

// 辞書(interface or type)から{ type, body }ユニオンを定義
// https://stackoverflow.com/questions/49311989/can-i-infer-the-type-of-a-value-using-extends-keyof-type
// VS Codeの展開を防止するためにEvents型を定義
type Events<T extends object> = { [K in keyof T]: { type: K; body: T[K]; } };
type EventUnionFromDictionary<
	T extends object,
	U = Events<T>,
> = U[keyof U];

type SerializedAll<T> = {
	[K in keyof T]: Serialized<T[K]>;
};

type UndefinedAsNullAll<T> = {
	[K in keyof T]: T[K] extends undefined ? null : T[K];
};

export interface InternalEventTypes {
	userChangeSuspendedState: { id: MiUser['id']; isSuspended: MiUser['isSuspended']; };
	userChangeDeletedState: { id: MiUser['id']; isDeleted: MiUser['isDeleted']; };
	userTokenRegenerated: { id: MiUser['id']; oldToken: string; newToken: string; };
	/** @deprecated Use userUpdated or usersUpdated instead */
	remoteUserUpdated: { id: MiUser['id']; };
	/** @deprecated Use userUpdated or usersUpdated instead */
	localUserUpdated: { id: MiUser['id']; };
	usersUpdated: { ids: MiUser['id'][]; };
	userUpdated: { id: MiUser['id']; };
	follow: { followerId: MiUser['id']; followeeId: MiUser['id']; };
	unfollow: { followerId: MiUser['id']; followeeId: MiUser['id']; };
	blockingCreated: { blockerId: MiUser['id']; blockeeId: MiUser['id']; };
	blockingDeleted: { blockerId: MiUser['id']; blockeeId: MiUser['id']; };
	policiesUpdated: MiRole['policies'];
	roleCreated: MiRole;
	roleDeleted: MiRole;
	roleUpdated: MiRole;
	userRoleAssigned: MiRoleAssignment;
	userRoleUnassigned: MiRoleAssignment;
	webhookCreated: { id: MiWebhook['id'] };
	webhookDeleted: { id: MiWebhook['id'] };
	webhookUpdated: { id: MiWebhook['id'] };
	systemWebhookCreated: { id: MiSystemWebhook['id'] };
	systemWebhookDeleted: { id: MiSystemWebhook['id'] };
	systemWebhookUpdated: { id: MiSystemWebhook['id'] };
	antennaCreated: MiAntenna;
	antennaDeleted: MiAntenna;
	antennaUpdated: MiAntenna;
	avatarDecorationCreated: MiAvatarDecoration;
	avatarDecorationDeleted: MiAvatarDecoration;
	avatarDecorationUpdated: MiAvatarDecoration;
	metaUpdated: { before?: MiMeta; after: MiMeta; };
	followChannel: { userId: MiUser['id']; channelId: MiChannel['id']; };
	unfollowChannel: { userId: MiUser['id']; channelId: MiChannel['id']; };
	updateUserProfile: { userId: MiUserProfile['userId'] };
	mute: { muterId: MiUser['id']; muteeId: MiUser['id']; };
	unmute: { muterId: MiUser['id']; muteeId: MiUser['id']; };
	userListMemberAdded: { userListId: MiUserList['id']; memberId: MiUser['id']; };
	userListMemberUpdated: { userListId: MiUserList['id']; memberId: MiUser['id']; };
	userListMemberRemoved: { userListId: MiUserList['id']; memberId: MiUser['id']; };
	userListMemberBulkAdded: { userListIds: MiUserList['id'][]; memberId: MiUser['id']; };
	userListMemberBulkUpdated: { userListIds: MiUserList['id'][]; memberId: MiUser['id']; };
	userListMemberBulkRemoved: { userListIds: MiUserList['id'][]; memberId: MiUser['id']; };
	quantumCacheUpdated: { name: string, keys: string[] };
	quantumCacheReset: { name: string };
	collapsedQueueDefer: { name: string, key: string, deferred: boolean };
	collapsedQueueEnqueue: { name: string, key: string, value: unknown };
}

type EventTypesToEventPayload<T> = EventUnionFromDictionary<UndefinedAsNullAll<SerializedAll<T>>>;

// name/messages(spec) pairs dictionary
export type GlobalEvents = {
	internal: {
		name: 'internal';
		payload: EventTypesToEventPayload<InternalEventTypes>;
	};
	broadcast: {
		name: 'broadcast';
		payload: EventTypesToEventPayload<BroadcastTypes>;
	};
	main: {
		name: `mainStream:${MiUser['id']}`;
		payload: EventTypesToEventPayload<MainEventTypes>;
	};
	drive: {
		name: `driveStream:${MiUser['id']}`;
		payload: EventTypesToEventPayload<DriveEventTypes>;
	};
	note: {
		name: `noteStream:${MiNote['id']}`;
		payload: EventTypesToEventPayload<NoteStreamEventTypes>;
	};
	userList: {
		name: `userListStream:${MiUserList['id']}`;
		payload: EventTypesToEventPayload<UserListEventTypes>;
	};
	roleTimeline: {
		name: `roleTimelineStream:${MiRole['id']}`;
		payload: EventTypesToEventPayload<RoleTimelineEventTypes>;
	};
	antenna: {
		name: `antennaStream:${MiAntenna['id']}`;
		payload: EventTypesToEventPayload<AntennaEventTypes>;
	};
	admin: {
		name: `adminStream:${MiUser['id']}`;
		payload: EventTypesToEventPayload<AdminEventTypes>;
	};
	notes: {
		name: 'notesStream';
		payload: Serialized<Packed<'Note'>>;
	};
	chatUser: {
		name: `chatUserStream:${MiUser['id']}-${MiUser['id']}`;
		payload: EventTypesToEventPayload<ChatEventTypes>;
	};
	chatRoom: {
		name: `chatRoomStream:${MiChatRoom['id']}`;
		payload: EventTypesToEventPayload<ChatEventTypes>;
	};
	reversi: {
		name: `reversiStream:${MiUser['id']}`;
		payload: EventTypesToEventPayload<ReversiEventTypes>;
	};
	reversiGame: {
		name: `reversiGameStream:${MiReversiGame['id']}`;
		payload: EventTypesToEventPayload<ReversiGameEventTypes>;
	};
};

// API event definitions
// ストリームごとのEmitterの辞書を用意
type EventEmitterDictionary = { [x in keyof GlobalEvents]: Emitter.default<EventEmitter, { [y in GlobalEvents[x]['name']]: (e: GlobalEvents[x]['payload']) => void }> };
// 共用体型を交差型にする型 https://stackoverflow.com/questions/54938141/typescript-convert-union-to-intersection
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;
// Emitter辞書から共用体型を作り、UnionToIntersectionで交差型にする
export type StreamEventEmitter = UnionToIntersection<EventEmitterDictionary[keyof GlobalEvents]>;
// { [y in name]: (e: spec) => void }をまとめてその交差型をEmitterにかけるとts(2590)にひっかかる

// provide stream channels union
export type StreamChannels = GlobalEvents[keyof GlobalEvents]['name'];

@Injectable()
export class GlobalEventService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redisForPub)
		private redisForPub: Redis.Redis,

		private readonly internalEventService: InternalEventService,
	) {
	}

	@bindThis
	private async publish(channel: StreamChannels, type: string | null, value?: any): Promise<void> {
		const message = type == null ? value : value == null ?
			{ type: type, body: null } :
			{ type: type, body: value };

		await this.redisForPub.publish(this.config.host, JSON.stringify({
			channel: channel,
			message: message,
		}));
	}

	/** @deprecated use InternalEventService instead */
	@bindThis
	public publishInternalEvent<K extends keyof InternalEventTypes>(type: K, value: InternalEventTypes[K]): void {
		trackPromise(this.internalEventService.emit(type, value));
	}

	/** @deprecated use InternalEventService instead */
	@bindThis
	public async publishInternalEventAsync<K extends keyof InternalEventTypes>(type: K, value: InternalEventTypes[K]): Promise<void> {
		await this.internalEventService.emit(type, value);
	}

	@bindThis
	public async publishBroadcastStream<K extends keyof BroadcastTypes>(type: K, value?: BroadcastTypes[K]): Promise<void> {
		await this.publish('broadcast', type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public async publishMainStream<K extends keyof MainEventTypes>(userId: MiUser['id'], type: K, value?: MainEventTypes[K]): Promise<void> {
		await this.publish(`mainStream:${userId}`, type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public async publishDriveStream<K extends keyof DriveEventTypes>(userId: MiUser['id'], type: K, value?: DriveEventTypes[K]): Promise<void> {
		await this.publish(`driveStream:${userId}`, type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public async publishNoteStream<K extends keyof NoteEventTypes>(noteId: MiNote['id'], type: K, value?: NoteEventTypes[K]): Promise<void> {
		await this.publish(`noteStream:${noteId}`, type, {
			id: noteId,
			body: value,
		});
	}

	@bindThis
	public async publishUserListStream<K extends keyof UserListEventTypes>(listId: MiUserList['id'], type: K, value?: UserListEventTypes[K]): Promise<void> {
		await this.publish(`userListStream:${listId}`, type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public async publishAntennaStream<K extends keyof AntennaEventTypes>(antennaId: MiAntenna['id'], type: K, value?: AntennaEventTypes[K]): Promise<void> {
		await this.publish(`antennaStream:${antennaId}`, type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public async publishRoleTimelineStream<K extends keyof RoleTimelineEventTypes>(roleId: MiRole['id'], type: K, value?: RoleTimelineEventTypes[K]): Promise<void> {
		await this.publish(`roleTimelineStream:${roleId}`, type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public async publishNotesStream(note: Packed<'Note'>): Promise<void> {
		await this.publish('notesStream', null, note);
	}

	@bindThis
	public async publishAdminStream<K extends keyof AdminEventTypes>(userId: MiUser['id'], type: K, value?: AdminEventTypes[K]): Promise<void> {
		await this.publish(`adminStream:${userId}`, type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public async publishChatUserStream<K extends keyof ChatEventTypes>(fromUserId: MiUser['id'], toUserId: MiUser['id'], type: K, value?: ChatEventTypes[K]): Promise<void> {
		await this.publish(`chatUserStream:${fromUserId}-${toUserId}`, type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public async publishChatRoomStream<K extends keyof ChatEventTypes>(toRoomId: MiChatRoom['id'], type: K, value?: ChatEventTypes[K]): Promise<void> {
		await this.publish(`chatRoomStream:${toRoomId}`, type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public async publishReversiStream<K extends keyof ReversiEventTypes>(userId: MiUser['id'], type: K, value?: ReversiEventTypes[K]): Promise<void> {
		await this.publish(`reversiStream:${userId}`, type, typeof value === 'undefined' ? null : value);
	}

	@bindThis
	public async publishReversiGameStream<K extends keyof ReversiGameEventTypes>(gameId: MiReversiGame['id'], type: K, value?: ReversiGameEventTypes[K]): Promise<void> {
		await this.publish(`reversiGameStream:${gameId}`, type, typeof value === 'undefined' ? null : value);
	}
}
