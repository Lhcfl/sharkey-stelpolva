/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, JoinColumn, Column, ManyToOne } from 'typeorm';
import { MiUser } from '@/models/User.js';
import { MiNote } from '@/models/Note.js';
import { isQuote, isRenote, MinimalNote } from '@/misc/is-renote.js';

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
		foreignKeyConstraintName: 'FK_20e346fffe4a2174585005d6d80',
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
		foreignKeyConstraintName: 'FK_47a38b1c13de6ce4e5090fb1acd',
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
	static keyFor(note: MinimalNote) {
		return {
			userId: note.userId,
			isPublic: note.visibility === 'public',
			isReply: note.replyId != null,
			isQuote: isRenote(note) && isQuote(note),
		};
	}

	/**
	 * Checks if two notes would produce equivalent compound keys.
	 */
	static areEquivalent(first: MinimalNote, second: MinimalNote): boolean {
		const firstKey = SkLatestNote.keyFor(first);
		const secondKey = SkLatestNote.keyFor(second);

		return (
			firstKey.userId === secondKey.userId &&
			firstKey.isPublic === secondKey.isPublic &&
			firstKey.isReply === secondKey.isReply &&
			firstKey.isQuote === secondKey.isQuote
		);
	}
}
