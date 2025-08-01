/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { load as cheerio } from 'cheerio/slim';
import type { IApDocument } from '@/core/activitypub/type.js';
import type { CheerioAPI } from 'cheerio/slim';

/**
 * Finds HTML elements representing inline media and returns them as simulated AP documents.
 * Returns an empty array if the input cannot be parsed, or no media was found.
 * @param html Input HTML to analyze.
 */
export function extractMediaFromHtml(html: string): IApDocument[] {
	const $ = parseHtml(html);
	if (!$) return [];

	const attachments = new Map<string, IApDocument>();

	// <img> tags, including <picture> and <object> fallback elements
	// https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/img
	$('img[src]')
		.toArray()
		.forEach(img => attachments.set(img.attribs.src, {
			type: 'Image',
			url: img.attribs.src,
			name: img.attribs.alt || img.attribs.title || null,
		}));

	// <object> tags
	// https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/object
	$('object[data]')
		.toArray()
		.forEach(object => attachments.set(object.attribs.data, {
			type: 'Document',
			url: object.attribs.data,
			name: object.attribs.alt || object.attribs.title || null,
		}));

	// <embed> tags
	// https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/embed
	$('embed[src]')
		.toArray()
		.forEach(embed => attachments.set(embed.attribs.src, {
			type: 'Document',
			url: embed.attribs.src,
			name: embed.attribs.alt || embed.attribs.title || null,
		}));

	// <audio> tags
	// https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/audio
	$('audio[src]')
		.toArray()
		.forEach(audio => attachments.set(audio.attribs.src, {
			type: 'Audio',
			url: audio.attribs.src,
			name: audio.attribs.alt || audio.attribs.title || null,
		}));

	// <video> tags
	// https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video
	$('video[src]')
		.toArray()
		.forEach(audio => attachments.set(audio.attribs.src, {
			type: 'Video',
			url: audio.attribs.src,
			name: audio.attribs.alt || audio.attribs.title || null,
		}));

	// TODO support <svg>? We would need to extract it directly from the HTML and save to a temp file.

	return Array.from(attachments.values());
}

function parseHtml(html: string): CheerioAPI | null {
	try {
		return cheerio(html);
	} catch {
		// Don't worry about invalid HTML
		return null;
	}
}
