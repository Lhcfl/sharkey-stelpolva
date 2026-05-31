/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiDriveFolder } from '@/models/DriveFolder.js';
import type { MiUserList } from '@/models/UserList.js';
import type { MiAbuseUserReport } from '@/models/AbuseUserReport.js';
import type { MiSignin } from '@/models/Signin.js';
import type { MiPage } from '@/models/Page.js';
import type { MiChatMessage, MiChatRoom, MiReversiGame, MiRole } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { EmptyObject, Serialized } from '@/types.js';
import { bindThis } from '@/decorators.js';
import type { InternalEventTypes } from '@/global/InternalEventService.js';
import type * as Redis from 'ioredis';
import type * as Reversi from 'misskey-reversi';

//#region Stream type-body definitions
export interface BroadcastEventTypes {
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
	updated: EmptyObject;
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
		userId: MiUser['id'];
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
export type EventUnionFromDictionary<
	T extends object,
	U = Events<T>,
> = U[keyof U];

type SerializedAll<T> = {
	[K in keyof T]: Serialized<T[K]>;
};

type UndefinedAsNullAll<T> = {
	[K in keyof T]: T[K] extends undefined ? null : T[K];
};

type EventTypesToEventPayload<T extends object> = EventUnionFromDictionary<UndefinedAsNullAll<SerializedAll<T>> | T>;

// name/messages(spec) pairs dictionary
export type InternalEventPayload = EventTypesToEventPayload<InternalEventTypes>;
export type BroadcastEventPayload = EventTypesToEventPayload<BroadcastEventTypes>;
export type NotesStreamEventPayload = Serialized<Packed<'Note'>>;
export type NoteStreamEventPayload = EventTypesToEventPayload<NoteStreamEventTypes>;
export type MainEventPayload = EventTypesToEventPayload<MainEventTypes>;
export type DriveEventPayload = EventTypesToEventPayload<DriveEventTypes>;
export type UserListEventPayload = EventTypesToEventPayload<UserListEventTypes>;
export type RoleTimelineEventPayload = EventTypesToEventPayload<RoleTimelineEventTypes>;
export type AntennaEventPayload = EventTypesToEventPayload<AntennaEventTypes>;
export type AdminEventPayload = EventTypesToEventPayload<AdminEventTypes>;
export type ChatEventPayload = EventTypesToEventPayload<ChatEventTypes>;
export type ReversiEventPayload = EventTypesToEventPayload<ReversiEventTypes>;
export type ReversiGameEventPayload = EventTypesToEventPayload<ReversiGameEventTypes>;
export type GlobalEventsMap = {
	internal: [InternalEventPayload];
	broadcast: [BroadcastEventPayload];
	notesStream: [NotesStreamEventPayload];
} & {
	[k: `noteStream:${MiNote['id']}`]: [NoteStreamEventPayload];
} & {
	[k: `mainStream:${MiUser['id']}`]: [MainEventPayload];
} & {
	[k: `driveStream:${MiUser['id']}`]: [DriveEventPayload];
} & {
	[k: `userListStream:${MiUserList['id']}`]: [UserListEventPayload];
} & {
	[k: `roleTimelineStream:${MiRole['id']}`]: [RoleTimelineEventPayload];
} & {
	[k: `antennaStream:${MiAntenna['id']}`]: [AntennaEventPayload];
} & {
	[k: `adminStream:${MiUser['id']}`]: [AdminEventPayload];
} & {
	[k: `chatUserStream:${MiUser['id']}-${MiUser['id']}`]: [ChatEventPayload];
} & {
	[k: `chatRoomStream:${MiChatRoom['id']}`]: [ChatEventPayload];
} & {
	[k: `reversiStream:${MiUser['id']}`]: [ReversiEventPayload];
} & {
	[k: `reversiGameStream:${MiReversiGame['id']}`]: [ReversiGameEventPayload];
};

type TranslateEventToLegacy<Name extends keyof GlobalEventsMap> = {
	name: Name,
	payload: GlobalEventsMap[Name] extends [infer Payload] ? Payload : never;
};

/**
 * @deprecated This is provided for backwards-compatibility only, please use the direct exports instead.
 */
export interface GlobalEvents {
	internal: TranslateEventToLegacy<'internal'>;
	broadcast: TranslateEventToLegacy<'broadcast'>;
	main: TranslateEventToLegacy<`mainStream:${MiUser['id']}`>;
	drive: TranslateEventToLegacy<`driveStream:${MiUser['id']}`>;
	note: TranslateEventToLegacy<`noteStream:${MiNote['id']}`>;
	userList: TranslateEventToLegacy<`userListStream:${MiUserList['id']}`>;
	roleTimeline: TranslateEventToLegacy<`roleTimelineStream:${MiRole['id']}`>;
	antenna: TranslateEventToLegacy<`antennaStream:${MiAntenna['id']}`>;
	admin: TranslateEventToLegacy<`adminStream:${MiUser['id']}`>;
	notes: TranslateEventToLegacy<'notesStream'>;
	chatUser: TranslateEventToLegacy<`chatUserStream:${MiUser['id']}-${MiUser['id']}`>;
	chatRoom: TranslateEventToLegacy<`chatRoomStream:${MiChatRoom['id']}`>;
	reversi: TranslateEventToLegacy<`reversiStream:${MiUser['id']}`>;
	reversiGame: TranslateEventToLegacy<`reversiGameStream:${MiReversiGame['id']}`>;
}

// API event definitions
export type GlobalEventNames = keyof GlobalEventsMap;
export type GlobalEventPayload<E extends GlobalEventNames> = GlobalEventsMap[E] extends [infer Payload] ? Payload : never;
export type GlobalEventTypes<E extends GlobalEventNames> = GlobalEventPayload<E> extends { type: infer Type, body: GlobalEventBodies<E> } ? Type : null;
export type GlobalEventBodies<E extends GlobalEventNames> = GlobalEventPayload<E> extends { type: string, body: infer Body } ? Body : GlobalEventPayload<E>;
export type GlobalEventBody<E extends GlobalEventNames, Type extends GlobalEventTypes<E>> = Type extends null
	? GlobalEventPayload<E>
	: Extract<GlobalEventPayload<E>, { type: Type, body: GlobalEventBodies<E> }>['body'];
export type GlobalEvent<E extends GlobalEventNames> = {
	node?: string;
	channel: E;
	message: GlobalEvent<E> extends [infer Payload] ? Payload : never;
};

// TODO extract a common EventBus<TMap> class from InternalEventService, then use that for each stream type.
@Injectable()
export class GlobalEventService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redisForPub)
		private redisForPub: Redis.Redis,
	) {
	}

	@bindThis
	private async publish<Name extends GlobalEventNames, Type extends GlobalEventTypes<Name>>(channel: Name, type: Type, value: GlobalEventBody<Name, Type>): Promise<void> {
		const message = type == null ? value : value == null ?
			{ type: type, body: null } :
			{ type: type, body: value };

		await this.redisForPub.publish(this.config.host, JSON.stringify({
			channel: channel,
			message: message,
		}));
	}

	@bindThis
	public async publishBroadcastStream<Type extends GlobalEventTypes<'broadcast'>>(type: Type, value: GlobalEventBody<'broadcast', Type>): Promise<void> {
		await this.publish('broadcast', type, value);
	}

	@bindThis
	public async publishMainStream<Id extends MiUser['id'], Type extends GlobalEventTypes<`mainStream:${Id}`>>(userId: Id, type: Type, value: GlobalEventBody<`mainStream:${Id}`, Type>): Promise<void> {
		await this.publish(`mainStream:${userId}`, type, value);
	}

	@bindThis
	public async publishDriveStream<Id extends MiUser['id'], Type extends GlobalEventTypes<`driveStream:${Id}`>>(userId: Id, type: Type, value: GlobalEventBody<`driveStream:${Id}`, Type>): Promise<void> {
		await this.publish(`driveStream:${userId}`, type, value);
	}

	@bindThis
	public async publishNoteStream<Id extends MiNote['id'], Type extends GlobalEventTypes<`noteStream:${Id}`>>(noteId: Id, type: Type, value: GlobalEventBody<`noteStream:${Id}`, Type>): Promise<void> {
		await this.publish(`noteStream:${noteId}`, type, value);
	}

	@bindThis
	public async publishUserListStream<Id extends MiUserList['id'], Type extends GlobalEventTypes<`userListStream:${Id}`>>(userListId: Id, type: Type, value: GlobalEventBody<`userListStream:${Id}`, Type>): Promise<void> {
		await this.publish(`userListStream:${userListId}`, type, value);
	}

	@bindThis
	public async publishAntennaStream<Id extends MiAntenna['id'], Type extends GlobalEventTypes<`antennaStream:${Id}`>>(antennaId: Id, type: Type, value: GlobalEventBody<`antennaStream:${Id}`, Type>): Promise<void> {
		await this.publish(`antennaStream:${antennaId}`, type, value);
	}

	@bindThis
	public async publishRoleTimelineStream<Id extends MiUser['id'], Type extends GlobalEventTypes<`roleTimelineStream:${Id}`>>(userId: Id, type: Type, value: GlobalEventBody<`roleTimelineStream:${Id}`, Type>): Promise<void> {
		await this.publish(`roleTimelineStream:${userId}`, type, value);
	}

	@bindThis
	public async publishNotesStream(note: Packed<'Note'>): Promise<void> {
		await this.publish('notesStream', null, note);
	}

	@bindThis
	public async publishAdminStream<Id extends MiUser['id'], Type extends GlobalEventTypes<`adminStream:${Id}`>>(userId: Id, type: Type, value: GlobalEventBody<`adminStream:${Id}`, Type>): Promise<void> {
		await this.publish(`adminStream:${userId}`, type, value);
	}

	@bindThis
	public async publishChatUserStream<FromId extends MiUser['id'], ToId extends MiUser['id'], Type extends GlobalEventTypes<`chatUserStream:${FromId}-${ToId}`>>(fromUserId: FromId, toUserId: ToId, type: Type, value: GlobalEventBody<`chatUserStream:${FromId}-${ToId}`, Type>): Promise<void> {
		await this.publish(`chatUserStream:${fromUserId}-${toUserId}`, type, value);
	}

	@bindThis
	public async publishChatRoomStream<Id extends MiChatRoom['id'], Type extends GlobalEventTypes<`chatRoomStream:${Id}`>>(chatRoomId: Id, type: Type, value: GlobalEventBody<`chatRoomStream:${Id}`, Type>): Promise<void> {
		await this.publish(`chatRoomStream:${chatRoomId}`, type, value);
	}

	@bindThis
	public async publishReversiStream<Id extends MiUser['id'], Type extends GlobalEventTypes<`reversiStream:${Id}`>>(userId: Id, type: Type, value: GlobalEventBody<`reversiStream:${Id}`, Type>): Promise<void> {
		await this.publish(`reversiStream:${userId}`, type, value);
	}

	@bindThis
	public async publishReversiGameStream<Id extends MiReversiGame['id'], Type extends GlobalEventTypes<`reversiGameStream:${Id}`>>(reversiGameId: Id, type: Type, value: GlobalEventBody<`reversiGameStream:${Id}`, Type>): Promise<void> {
		await this.publish(`reversiGameStream:${reversiGameId}`, type, value);
	}
}
