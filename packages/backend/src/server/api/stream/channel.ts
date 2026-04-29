/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { bindThis } from '@/decorators.js';
import type { Packed } from '@/misc/json-schema.js';
import type { JsonObject, JsonValue } from '@/misc/json-value.js';
import type { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import type Connection from '@/server/api/stream/Connection.js';

/**
 * Stream channel
 */
export abstract class Channel {
	protected connection: Connection;
	public id: string;
	public abstract readonly chName: string;
	public static readonly shouldShare: boolean;
	public static readonly requireCredential: boolean;
	public static readonly kind?: string | null;

	protected get user() {
		return this.connection.user;
	}

	protected get userProfile() {
		return this.connection.userProfile;
	}

	protected get cacheService() {
		return this.connection.cacheService;
	}

	/**
	 * @deprecated use cacheService.userFollowingsCache to avoid stale data
	 */
	protected get following() {
		return this.connection.following;
	}

	/**
	 * TODO use onChange to keep these in sync?
	 * @deprecated use cacheService.userMutingsCache to avoid stale data
	 */
	protected get userIdsWhoMeMuting() {
		return this.connection.userIdsWhoMeMuting;
	}

	/**
	 * @deprecated use cacheService.renoteMutingsCache to avoid stale data
	 */
	protected get userIdsWhoMeMutingRenotes() {
		return this.connection.userIdsWhoMeMutingRenotes;
	}

	/**
	 * @deprecated use cacheService.userBlockedCache to avoid stale data
	 */
	protected get userIdsWhoBlockingMe() {
		return this.connection.userIdsWhoBlockingMe;
	}

	/**
	 * @deprecated use cacheService.threadMutingsCache to avoid stale data
	 */
	protected get userMutedInstances() {
		return this.connection.userMutedInstances;
	}

	/**
	 * @deprecated use cacheService.threadMutingsCache to avoid stale data
	 */
	protected get userMutedThreads() {
		return this.connection.userMutedThreads;
	}

	/**
	 * @deprecated use cacheService.noteMutingsCache to avoid stale data
	 */
	protected get userMutedNotes() {
		return this.connection.userMutedNotes;
	}

	/**
	 * @deprecated use cacheService.threadMutingsCache to avoid stale data
	 */
	protected get followingChannels() {
		return this.connection.followingChannels;
	}

	protected get subscriber() {
		return this.connection.subscriber;
	}

	protected get myRecentReactions() {
		return this.connection.myRecentReactions;
	}

	protected get myRecentRenotes() {
		return this.connection.myRecentRenotes;
	}

	protected get myRecentFavorites() {
		return this.connection.myRecentFavorites;
	}

	constructor(id: string, connection: Connection) {
		this.id = id;
		this.connection = connection;
	}

	public send(payload: { type: string, body: JsonValue }): void;
	public send(type: string, payload: JsonValue): void;
	@bindThis
	public send(typeOrPayload: { type: string, body: JsonValue } | string, payload?: JsonValue) {
		const type = payload === undefined ? (typeOrPayload as { type: string, body: JsonValue }).type : (typeOrPayload as string);
		const body = payload === undefined ? (typeOrPayload as { type: string, body: JsonValue }).body : payload;

		this.connection.sendMessageToWs('channel', {
			id: this.id,
			type: type,
			body: body,
		});
	}

	public abstract init(params: JsonObject): void | Promise<void> | Promise<boolean>;

	public dispose?(): void;

	public onMessage?(type: string, body: JsonValue): void;
}

// For compatability with old code
// eslint-disable-next-line import/no-default-export
export default Channel;

export abstract class NoteChannel extends Channel {
	protected constructor(
		id: string,
		connection: Connection,
		protected readonly noteEntityService: NoteEntityService,
	) {
		super(id, connection);
	}

	protected get noteVisibilityService() {
		return this.noteEntityService.noteVisibilityService;
	}

	/**
	 * Prepares a note before it gets sent to the client.
	 * @returns A packed note, or `null` if the note shouldn't be seen by the user
	 * who owns this connection, for whatever reason.
	 */
	@bindThis
	protected async prepareNote(note: Packed<'Note'>): Promise<Packed<'Note'> | null> {
		const { accessible, silence } = await this.noteVisibilityService.checkNoteVisibilityAsync(note, this.user);

		// Skip notes that the user can't or shouldn't access
		if (!accessible || silence) {
			return null;
		}

		// If there's no user, then packing won't change anything.
		// We can just re-use the original note.
		if (!this.user) {
			return note;
		}

		// Otherwise, re-pack the anonymous note for the actual target user.
		return await this.noteEntityService.rePack(note, this.user, {
			myReactions: this.myRecentReactions,
			myRenotes: this.myRecentRenotes,
			myFavorites: this.myRecentFavorites,
		});
	}
}

export type MiChannelService<T extends boolean> = {
	shouldShare: boolean;
	requireCredential: T;
	kind: T extends true ? string : string | null | undefined;
	create: (id: string, connection: Connection) => Channel;
};
