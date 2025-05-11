/*
* SPDX-FileCopyrightText: piuvas and other Sharkey contributors
* SPDX-License-Identifier: AGPL-3.0-only
*/

import { load as cheerio } from 'cheerio';
import type { HttpRequestService } from '@/core/HttpRequestService.js';

type Field = { name: string, value: string };

export async function verifyFieldLinks(fields: Field[], profile_url: string, httpRequestService: HttpRequestService): Promise<string[]> {
	const verified_links = [];
	for (const field_url of fields.filter(x => URL.canParse(x.value) && ['http:', 'https:'].includes((new URL(x.value).protocol)))) {
		try {
			const html = await httpRequestService.getHtml(field_url.value);

			const doc = cheerio(html);

			const links = doc('a[rel~="me"][href], link[rel~="me"][href]').toArray();

			const includesProfileLinks = links.some(link => link.attribs.href === profile_url);
			if (includesProfileLinks) {
				verified_links.push(field_url.value);
			}
		} catch {
			// don't do anything.
		}
	}

	return verified_links;
}
