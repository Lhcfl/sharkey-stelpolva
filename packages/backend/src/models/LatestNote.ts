/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, JoinColumn, Column, ManyToOne } from 'typeorm';
import { MiUser } from '@/models/User.js';
import { MiNote } from '@/models/Note.js';

/**
 * Maps a user to the most recent post by that user.
 * Public, home-only, and followers-only posts are included.
 * DMs are not counted.
 */
@Entity('latest_note')
export class LatestNote {
	@PrimaryColumn({
		name: 'user_id',
		type: 'varchar' as const,
		length: 32,
	})
	public userId: string;

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

	constructor(data?: Partial<LatestNote>) {
		if (!data) return;

		for (const [k, v] of Object.entries(data)) {
			(this as Record<string, unknown>)[k] = v;
		}
	}
}
