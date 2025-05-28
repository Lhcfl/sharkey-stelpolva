/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';

/**
 * Gets IDs of notes that are visibly the "same" as the current note.
 * These are IDs that should not be recursively resolved when starting from the provided note as entry.
 */
export function getSelfNoteIds(note: Misskey.entities.Note): string[] {
	const ids = [note.id]; // Regular note
	if (note.reply) ids.push(note.reply.id); // Reply
	else if (note.replyId) ids.push(note.replyId); // Reply (not packed)
	if (note.renote) ids.push(note.renote.id); // Renote or quote
	else if (note.renoteId) ids.push(note.renoteId); // Renote or quote (not packed)
	if (note.renote?.renote) ids.push(note.renote.renote.id); // Renote *of* a quote
	else if (note.renote?.renoteId) ids.push(note.renote.renoteId); // Renote *of* a quote (not packed)
	return ids;
}
