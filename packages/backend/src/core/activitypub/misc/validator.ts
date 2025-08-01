/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IdentifiableError } from '@/misc/identifiable-error.js';
import type { Response } from 'node-fetch';

export function validateContentTypeSetAsActivityPub(response: Response): void {
	const contentType = (response.headers.get('content-type') ?? '').toLowerCase();

	if (contentType === '') {
		throw new IdentifiableError('d09dc850-b76c-4f45-875a-7389339d78b8', `invalid AP response from ${response.url}: no content-type header`, true);
	}
	if (
		contentType.startsWith('application/activity+json') ||
		(contentType.startsWith('application/ld+json;') && contentType.includes('https://www.w3.org/ns/activitystreams'))
	) {
		return;
	}
	throw new IdentifiableError('dc110060-a5f2-461d-808b-39c62702ca64', `invalid AP response from ${response.url}: content type "${contentType}" is not application/activity+json or application/ld+json`);
}

const plusJsonSuffixRegex = /^\s*(application|text)\/[a-zA-Z0-9\.\-\+]+\+json\s*(;|$)/;

export function validateContentTypeSetAsJsonLD(response: Response): void {
	const contentType = (response.headers.get('content-type') ?? '').toLowerCase();

	if (contentType === '') {
		throw new IdentifiableError('45793ab7-7648-4886-b503-429f8a0d0f73', `invalid AP response from ${response.url}: no content-type header`, true);
	}
	if (
		contentType.startsWith('application/ld+json') ||
		contentType.startsWith('application/json') ||
		plusJsonSuffixRegex.test(contentType)
	) {
		return;
	}
	throw new IdentifiableError('4bf8f36b-4d33-4ac9-ad76-63fa11f354e9', `invalid AP response from ${response.url}: content type "${contentType}" is not application/ld+json or application/json`);
}
