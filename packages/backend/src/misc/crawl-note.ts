/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Packed } from '@/misc/json-schema.js';

/**
 * Recursively crawls a packed Note entity to extract all nested Note entities.
 */
export function crawlNote(note: Packed<'Note'>, into?: Packed<'Note'>[]): Packed<'Note'>[] {
	into ??= [];

	if (!into.includes(note)) {
		into.push(note);
	}

	if (note.reply) {
		crawlNote(note.reply, into);
	}

	if (note.renote) {
		crawlNote(note.renote, into);
	}

	return into;
}
