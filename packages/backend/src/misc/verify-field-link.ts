/*
* SPDX-FileCopyrightText: piuvas and other Sharkey contributors
* SPDX-License-Identifier: AGPL-3.0-only
*/

import { load as cheerio } from 'cheerio/slim';
import type { HttpRequestService } from '@/core/HttpRequestService.js';

type Field = { name: string, value: string };

export async function verifyFieldLinks(fields: Field[], profileUrls: string[], httpRequestService: HttpRequestService): Promise<string[]> {
	const verified_links: string[] = [];
	for (const field_url of fields) {
		try {
			// getHtml validates the input URL, so we can safely pass in untrusted values
			const html = await httpRequestService.getHtml(field_url.value);

			const doc = cheerio(html);

			const links = doc('a[rel~="me"][href], link[rel~="me"][href]').toArray();

			const includesProfileLinks = links.some(link => profileUrls.includes(link.attribs.href));
			if (includesProfileLinks) {
				verified_links.push(field_url.value);
			}
		} catch {
			// don't do anything.
		}
	}

	return verified_links;
}
