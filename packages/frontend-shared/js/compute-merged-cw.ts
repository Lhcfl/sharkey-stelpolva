/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { appendContentWarning } from '@@/js/append-content-warning.js';

export function computeMergedCw(note: Misskey.entities.Note): string | null {
	let cw = note.cw;

	if (note.mandatoryCW) {
		cw = appendContentWarning(cw, note.mandatoryCW);
	}
	if (note.user.mandatoryCW) {
		cw = appendContentWarning(cw, note.user.mandatoryCW);
	}
	if (note.user.instance?.mandatoryCW) {
		cw = appendContentWarning(cw, note.user.instance.mandatoryCW);
	}

	return cw ?? null;
}
