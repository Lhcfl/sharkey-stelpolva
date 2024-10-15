/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, JoinColumn, Column, ManyToOne } from 'typeorm';
import { MiUser } from '@/models/User.js';
import { MiNote } from '@/models/Note.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';

/**
 * Maps a user to the most recent post by that user.
 * Public, home-only, and followers-only posts are included.
 * DMs are not counted.
 */
@Entity('latest_note')
export class SkLatestNote {
	@PrimaryColumn({
		name: 'user_id',
		type: 'varchar' as const,
		length: 32,
	})
	public userId: string;

	@PrimaryColumn('boolean', {
		name: 'is_public',
		default: false,
	})
	public isPublic: boolean;

	@PrimaryColumn('boolean', {
		name: 'is_reply',
		default: false,
	})
	public isReply: boolean;

	@PrimaryColumn('boolean', {
		name: 'is_quote',
		default: false,
	})
	public isQuote: boolean;

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({
		name: 'user_id',
	})
	public user: MiUser | null;

	@Column({
		name: 'note_id',
		type: 'varchar' as const,
		length: 32,
	})
	public noteId: string;

	@ManyToOne(() => MiNote, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({
		name: 'note_id',
	})
	public note: MiNote | null;

	constructor(data?: Partial<SkLatestNote>) {
		if (!data) return;

		for (const [k, v] of Object.entries(data)) {
			(this as Record<string, unknown>)[k] = v;
		}
	}

	/**
	 * Generates a compound key matching a provided note.
	 */
	static keyFor(note: MiNote) {
		return {
			userId: note.userId,
			isPublic: note.visibility === 'public',
			isReply: note.replyId != null,
			isQuote: isRenote(note) && isQuote(note),
		};
	}
}
