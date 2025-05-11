/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import * as Misskey from 'misskey-js';

export function checkWordMute(note: Misskey.entities.Note, me: Misskey.entities.UserLite | null | undefined, mutedWords: Array<string | string[]>): Array<string | string[]> | false {
	// 自分自身
	if (me && (note.userId === me.id)) return false;

	if (mutedWords.length > 0) {
		const text = getNoteText(note);

		if (text === '') return false;

		const matched = mutedWords.filter(filter => {
			if (Array.isArray(filter)) {
				// Clean up
				const filteredFilter = filter.filter(keyword => keyword !== '');
				if (filteredFilter.length === 0) return false;

				return filteredFilter.every(keyword => text.includes(keyword));
			} else {
				// represents RegExp
				const regexp = filter.match(/^\/(.+)\/(.*)$/);

				// This should never happen due to input sanitisation.
				if (!regexp) return false;

				try {
					return new RegExp(regexp[1], regexp[2]).test(text);
				} catch (err) {
					// This should never happen due to input sanitisation.
					return false;
				}
			}
		});

		if (matched.length > 0) return matched;
	}

	return false;
}

function getNoteText(note: Misskey.entities.Note): string {
	const textParts: string[] = [];

	if (note.cw) textParts.push(note.cw);

	if (note.text) textParts.push(note.text);

	if (note.files) {
		for (const file of note.files) {
			if (file.comment) textParts.push(file.comment);
		}
	}

	if (note.poll) {
		for (const choice of note.poll.choices) {
			if (choice.text) textParts.push(choice.text);
		}
	}

	return textParts.join('\n').trim();
}
