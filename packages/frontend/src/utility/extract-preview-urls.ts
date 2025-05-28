/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as config from '@@/js/config.js';
import type * as Misskey from 'misskey-js';
import type * as mfm from '@transfem-org/sfm-js';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';

/**
 * Extracts all previewable URLs from a note.
 */
export function extractPreviewUrls(note: Misskey.entities.Note, contents: mfm.MfmNode[]): string[] {
	const links = extractUrlFromMfm(contents);
	return links.filter(url =>
		// Remote note
		url !== note.url &&
		url !== note.uri &&
		// Local note
		url !== `${config.url}/notes/${note.id}` &&
		// Remote reply
		url !== note.reply?.url &&
		url !== note.reply?.uri &&
		// Local reply
		url !== `${config.url}/notes/${note.reply?.id}` &&
		// Remote renote or quote
		url !== note.renote?.url &&
		url !== note.renote?.uri &&
		// Local renote or quote
		url !== `${config.url}/notes/${note.renote?.id}` &&
		// Remote renote *of* a quote
		url !== note.renote?.renote?.url &&
		url !== note.renote?.renote?.uri &&
		// Local renote *of* a quote
		url !== `${config.url}/notes/${note.renote?.renote?.id}`);
}
