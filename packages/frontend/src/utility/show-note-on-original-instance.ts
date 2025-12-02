/*
 * SPDX-FileCopyrightText: bunnybeam and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { entities } from 'misskey-js';
import { warningExternalWebsite } from './warning-external-website';
import { useRouter } from '@/router';
import { notePage } from '@/filters/note.js';

const router = useRouter();

/**
 * Show a note on the remote instance, if possible. Otherwise, show the local note.
 */
export function showNoteOnOriginalInstance(note: entities.Note) {
	const remoteUrl = note.url ?? note.uri;
	if (remoteUrl) {
		warningExternalWebsite(remoteUrl);
	} else {
		router.push(notePage(note));
	}
}
