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
import type Connection from './Connection.js';

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

	protected get user() {
		return this.connection.user;
	}

	protected get userProfile() {
		return this.connection.userProfile;
	}

	protected get following() {
		return this.connection.following;
	}

	protected get userIdsWhoMeMuting() {
		return this.connection.userIdsWhoMeMuting;
	}

	protected get userIdsWhoMeMutingRenotes() {
		return this.connection.userIdsWhoMeMutingRenotes;
	}

	protected get userIdsWhoBlockingMe() {
		return this.connection.userIdsWhoBlockingMe;
	}

	protected get userMutedInstances() {
		return this.connection.userMutedInstances;
	}

	protected get followingChannels() {
		return this.connection.followingChannels;
	}

	protected get subscriber() {
		return this.connection.subscriber;
	}

	/*
	 * ミュートとブロックされてるを処理する
	 */
	protected isNoteMutedOrBlocked(note: Packed<'Note'>): boolean {
		// 流れてきたNoteがインスタンスミュートしたインスタンスが関わる
		if (isInstanceMuted(note, new Set<string>(this.userProfile?.mutedInstances ?? [])) && !this.following[note.userId]) return true;

		// 流れてきたNoteがミュートしているユーザーが関わる
		if (isUserRelated(note, this.userIdsWhoMeMuting)) return true;
		// 流れてきたNoteがブロックされているユーザーが関わる
		if (isUserRelated(note, this.userIdsWhoBlockingMe)) return true;

		// 流れてきたNoteがリノートをミュートしてるユーザが行ったもの
		if (isRenotePacked(note) && !isQuotePacked(note) && this.userIdsWhoMeMutingRenotes.has(note.user.id)) return true;

		// If it's a boost (pure renote) then we need to check the target as well
		if (isPackedPureRenote(note) && note.renote && this.isNoteMutedOrBlocked(note.renote)) return true;

		return false;
	}

	/**
	 * This function modifies {@link note}, please make sure it has been shallow cloned.
	 * See Dakkar's comment of {@link assignMyReaction} for more
	 * @param note The note to change
	 */
	protected async hideNote(note: Packed<'Note'>): Promise<void> {
		if (note.renote) {
			await this.hideNote(note.renote);
		}

		if (note.reply) {
			await this.hideNote(note.reply);
		}

		const meId = this.user?.id ?? null;
		await this.noteEntityService.hideNote(note, meId);
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

	public async assignMyReaction(note: Packed<'Note'>): Promise<Packed<'Note'>> {
		// StreamingApiServerService creates a single EventEmitter per server process,
		// so a new note arriving from redis gets de-serialised once per server process,
		// and then that single object is passed to all active channels on each connection.
		// If we didn't clone the notes here, different connections would asynchronously write
		// different values to the same object, resulting in a random value being sent to each frontend. -- Dakkar
		const clonedNote = { ...note };
		if (this.user && isRenotePacked(note) && !isQuotePacked(note)) {
			if (note.renote && Object.keys(note.renote.reactions).length > 0) {
				const myReaction = await this.noteEntityService.populateMyReaction(note.renote, this.user.id);
				if (myReaction) {
					clonedNote.renote = { ...note.renote };
					clonedNote.renote.myReaction = myReaction;
				}
			}
			if (note.renote?.reply && Object.keys(note.renote.reply.reactions).length > 0) {
				const myReaction = await this.noteEntityService.populateMyReaction(note.renote.reply, this.user.id);
				if (myReaction) {
					clonedNote.renote = { ...note.renote };
					clonedNote.renote.reply = { ...note.renote.reply };
					clonedNote.renote.reply.myReaction = myReaction;
				}
			}
		}
		if (this.user && note.reply && Object.keys(note.reply.reactions).length > 0) {
			const myReaction = await this.noteEntityService.populateMyReaction(note.reply, this.user.id);
			if (myReaction) {
				clonedNote.reply = { ...note.reply };
				clonedNote.reply.myReaction = myReaction;
			}
		}
		return clonedNote;
	}
}

export type MiChannelService<T extends boolean> = {
	shouldShare: boolean;
	requireCredential: T;
	kind: T extends true ? string : string | null | undefined;
	create: (id: string, connection: Connection) => Channel;
};
