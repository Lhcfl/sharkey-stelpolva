/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { IPost } from '@/core/activitypub/type.js';
import { toArray } from '@/misc/prelude/array.js';

/**
 * Gets content of a specified media type from a provided object.
 *
 * Optionally supports a "permissive" mode which enables the following changes:
 * 1. MIME types are checked in a case-insensitive manner.
 * 2. MIME types are matched based on inclusion, not strict equality.
 * 3. A candidate content is considered to match if it has no specified MIME type.
 *
 * Note: this method is written defensively to protect against malform remote objects.
 * When extending or modifying it, please be sure to work with "unknown" type and validate everything.
 *
 * Note: the logic in this method is carefully ordered to match the selection priority of existing code in ApNoteService.
 * Please do not re-arrange it without testing!
 * New checks can be added to the end of the method to safely extend the existing logic.
 *
 * @param object AP object to extract content from.
 * @param mimeType MIME type to look for.
 * @param permissive Enables permissive mode, as described above. Defaults to false (disabled).
 */
export function getContentByType(object: IPost | Record<string, unknown>, mimeType: string, permissive = false): string | null {
	// Case 1: Extended "source" property
	if (object.source && typeof(object.source) === 'object') {
		// "source" is permitted to be an array, though no implementations are known to do this yet.
		const sources = toArray(object.source) as Record<string, unknown>[];
		for (const source of sources) {
			if (typeof (source.content) === 'string' && checkMediaType(source.mediaType)) {
				return source.content;
			}
		}
	}

	// Case 2: Special case for MFM
	if (typeof(object._misskey_content) === 'string' && mimeType === 'text/x.misskeymarkdown') {
		return object._misskey_content;
	}

	// Case 3: AP native "content" property
	if (typeof(object.content) === 'string' && checkMediaType(object.mediaType)) {
		return object.content;
	}

	return null;

	// Checks if the provided media type matches the input parameters.
	function checkMediaType(mediaType: unknown): boolean {
		if (typeof(mediaType) === 'string') {
			// Strict match
			if (mediaType === mimeType) {
				return true;
			}

			// Permissive match
			if (permissive && mediaType.toLowerCase().includes(mimeType.toLowerCase())) {
				return true;
			}
		}

		// Permissive fallback match
		if (permissive && mediaType == null) {
			return true;
		}

		// No match
		return false;
	}
}
