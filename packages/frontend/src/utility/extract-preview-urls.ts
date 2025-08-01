/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import type * as mfm from 'mfm-js';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';
import { getNoteUrls } from '@/utility/getNoteUrls';

/**
 * Extracts all previewable URLs from a note.
 */
export function extractPreviewUrls(note: Misskey.entities.Note, contents: mfm.MfmNode[]): string[] {
	const links = extractUrlFromMfm(contents);
	if (links.length < 0) return [];

	const self = getNoteUrls(note);
	return links.filter(url => !self.includes(url));
}
