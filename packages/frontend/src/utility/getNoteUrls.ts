/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as config from '@@/js/config.js';
import type * as Misskey from 'misskey-js';

export function getNoteUrls(note: Misskey.entities.Note): string[] {
	const urls: string[] = [
		// Any note
		`${config.url}/notes/${note.id}`,
	];

	// Remote note
	if (note.url) urls.push(note.url);
	if (note.uri) urls.push(note.uri);

	if (note.reply) {
		// Any Reply
		urls.push(`${config.url}/notes/${note.reply.id}`);
		// Remote Reply
		if (note.reply.url) urls.push(note.reply.url);
		if (note.reply.uri) urls.push(note.reply.uri);
	}

	if (note.renote) {
		// Any Renote
		urls.push(`${config.url}/notes/${note.renote.id}`);
		// Remote Renote
		if (note.renote.url) urls.push(note.renote.url);
		if (note.renote.uri) urls.push(note.renote.uri);
	}

	if (note.renote?.renote) {
		// Any Quote
		urls.push(`${config.url}/notes/${note.renote.renote.id}`);
		// Remote Quote
		if (note.renote.renote.url) urls.push(note.renote.renote.url);
		if (note.renote.renote.uri) urls.push(note.renote.renote.uri);
	}

	return urls;
}
