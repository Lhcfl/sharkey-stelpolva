/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { bindThis } from '@/decorators.js';
import { isInstanceMuted } from '@/misc/is-instance-muted.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { isRenotePacked, isQuotePacked, isPackedPureRenote } from '@/misc/is-renote.js';
import type { Packed } from '@/misc/json-schema.js';
import type { JsonObject, JsonValue } from '@/misc/json-value.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { deepClone } from '@/misc/clone.js';
import type Connection from '@/server/api/stream/Connection.js';
import { NoteVisibilityFilters } from '@/core/NoteVisibilityService.js';

/**
 * Stream channel
 */
// eslint-disable-next-line import/no-default-export
export default abstract class Channel {
	protected readonly noteEntityService: NoteEntityService;
	protected connection: Connection;
	public id: string;
	public abstract readonly chName: string;
	public static readonly shouldShare: boolean;
	public static readonly requireCredential: boolean;
	public static readonly kind?: string | null;

	protected get noteVisibilityService() {
		return this.noteEntityService.noteVisibilityService;
	}

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

	protected async checkNoteVisibility(note: Packed<'Note'>, filters?: NoteVisibilityFilters) {
		// Don't use any of the local cached data, because this does everything through CacheService which is just as fast with updated data.
		return await this.noteVisibilityService.checkNoteVisibilityAsync(note, this.user, { filters });
	}

	/**
	 * Checks if a note is visible to the current user *excluding* blocks and mutes.
	 * @deprecated use isNoteHidden instead
	 */
	protected isNoteVisibleToMe(note: Packed<'Note'>): boolean {
		if (note.visibility === 'public') return true;
		if (note.visibility === 'home') return true;
		if (!this.user) return false;
		if (this.user.id === note.userId) return true;
		if (note.visibility === 'followers') {
			return this.following.has(note.userId);
		}
		if (!note.visibleUserIds) return false;
		return note.visibleUserIds.includes(this.user.id);
	}

	/**
	 * ミュートとブロックされてるを処理する
	 * @deprecated use isNoteHidden instead
	 */
	protected isNoteMutedOrBlocked(note: Packed<'Note'>): boolean {
		// Ignore notes that require sign-in
		if (note.user.requireSigninToViewContents && !this.user) return true;

		// 流れてきたNoteがインスタンスミュートしたインスタンスが関わる
		if (isInstanceMuted(note, this.userMutedInstances) && !this.following.has(note.userId)) return true;

		// 流れてきたNoteがミュートしているユーザーが関わる
		if (isUserRelated(note, this.userIdsWhoMeMuting)) return true;
		// 流れてきたNoteがブロックされているユーザーが関わる
		if (isUserRelated(note, this.userIdsWhoBlockingMe)) return true;

		// 流れてきたNoteがリノートをミュートしてるユーザが行ったもの
		if (isRenotePacked(note) && !isQuotePacked(note) && this.userIdsWhoMeMutingRenotes.has(note.user.id)) return true;

		// Muted thread
		if (this.userMutedThreads.has(note.threadId)) return true;

		// Muted note
		if (this.userMutedNotes.has(note.id)) return true;

		// If it's a boost (pure renote) then we need to check the target as well
		if (isPackedPureRenote(note) && note.renote && this.isNoteMutedOrBlocked(note.renote)) return true;

		// Hide silenced notes
		if (note.user.isSilenced || note.user.instance?.isSilenced) {
			if (this.user == null) return true;
			if (this.user.id === note.userId) return false;
			if (!this.following.has(note.userId)) return true;
		}

		return false;
	}

	constructor(id: string, connection: Connection, noteEntityService: NoteEntityService) {
		this.id = id;
		this.connection = connection;
		this.noteEntityService = noteEntityService;
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

	public abstract init(params: JsonObject): void;

	public dispose?(): void;

	public onMessage?(type: string, body: JsonValue): void;

	public async rePackNote(note: Packed<'Note'>): Promise<Packed<'Note'>> {
		// If there's no user, then packing won't change anything.
		// We can just re-use the original note.
		if (!this.user) {
			return note;
		}

		// StreamingApiServerService creates a single EventEmitter per server process,
		// so a new note arriving from redis gets de-serialised once per server process,
		// and then that single object is passed to all active channels on each connection.
		// If we didn't clone the notes here, different connections would asynchronously write
		// different values to the same object, resulting in a random value being sent to each frontend. -- Dakkar
		const clonedNote = deepClone(note);

		// Hide notes before everything else, since this modifies fields that the other functions will check.
		const notes = crawl(clonedNote);

		const [myReactions, myRenotes, myFavorites, myThreadMutings, myNoteMutings, myFollowings] = await Promise.all([
			this.noteEntityService.populateMyReactions(notes, this.user.id, {
				myReactions: this.myRecentReactions,
			}),
			this.noteEntityService.populateMyRenotes(notes, this.user.id, {
				myRenotes: this.myRecentRenotes,
			}),
			this.noteEntityService.populateMyFavorites(notes, this.user.id, {
				myFavorites: this.myRecentFavorites,
			}),
			this.noteEntityService.populateMyTheadMutings(notes, this.user.id),
			this.noteEntityService.populateMyNoteMutings(notes, this.user.id),
			this.cacheService.userFollowingsCache.fetch(this.user.id),
		]);

		for (const n of notes) {
			// Sync visibility in case there's something like "makeNotesFollowersOnlyBefore" enabled
			this.noteVisibilityService.syncVisibility(n);

			n.myReaction = myReactions.get(n.id) ?? null;
			n.isRenoted = myRenotes.has(n.id);
			n.isFavorited = myFavorites.has(n.id);
			n.isMutingThread = myThreadMutings.has(n.id);
			n.isMutingNote = myNoteMutings.has(n.id);
			n.user.bypassSilence = n.userId === this.user.id || myFollowings.has(n.userId);
		}

		// Hide notes *after* we sync visibility
		await this.noteEntityService.hideNotes(notes, this.user.id, {
			userFollowings: myFollowings,
		});

		return clonedNote;
	}
}

export type MiChannelService<T extends boolean> = {
	shouldShare: boolean;
	requireCredential: T;
	kind: T extends true ? string : string | null | undefined;
	create: (id: string, connection: Connection) => Channel;
};

function crawl(note: Packed<'Note'>, into?: Packed<'Note'>[]): Packed<'Note'>[] {
	into ??= [];

	if (!into.includes(note)) {
		into.push(note);
	}

	if (note.reply) {
		crawl(note.reply, into);
	}

	if (note.renote) {
		crawl(note.renote, into);
	}

	return into;
}
