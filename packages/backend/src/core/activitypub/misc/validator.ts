/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Response } from 'node-fetch';

// TODO throw identifiable or unrecoverable errors

export function validateContentTypeSetAsActivityPub(response: Response): void {
	const contentType = (response.headers.get('content-type') ?? '').toLowerCase();

	if (contentType === '') {
		throw new Error(`invalid content type of AP response - no content-type header: ${response.url}`);
	}
	if (
		contentType.startsWith('application/activity+json') ||
		(contentType.startsWith('application/ld+json;') && contentType.includes('https://www.w3.org/ns/activitystreams'))
	) {
		return;
	}
	throw new Error(`invalid content type of AP response - content type is not application/activity+json or application/ld+json: ${response.url}`);
}

const plusJsonSuffixRegex = /^\s*(application|text)\/[a-zA-Z0-9\.\-\+]+\+json\s*(;|$)/;

export function validateContentTypeSetAsJsonLD(response: Response): void {
	const contentType = (response.headers.get('content-type') ?? '').toLowerCase();

	if (contentType === '') {
		throw new Error(`invalid content type of JSON LD - no content-type header: ${response.url}`);
	}
	if (
		contentType.startsWith('application/ld+json') ||
		contentType.startsWith('application/json') ||
		plusJsonSuffixRegex.test(contentType)
	) {
		return;
	}
	throw new Error(`invalid content type of JSON LD - content type is not application/ld+json or application/json: ${response.url}`);
}
