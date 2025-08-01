/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';

// unique without hash
// [ http://a/#1, http://a/#2, http://b/#3 ] => [ http://a/#1, http://b/#3 ]
const removeHash = (x: string) => {
	if (URL.canParse(x)) {
		const url = new URL(x);
		url.hash = '';
		return url.toString();
	} else {
		return x.replace(/#[^#]*$/, '');
	}
};

export function extractUrlFromMfm(nodes: mfm.MfmNode[], respectSilentFlag = true): string[] {
	const urls = new Map<string, string>();

	// Single iteration pass to avoid potential DoS in maliciously-constructed notes.
	for (const node of nodes) {
		if ((node.type === 'url') || (node.type === 'link' && (!respectSilentFlag || !node.props.silent))) {
			const url = (node as mfm.MfmUrl | mfm.MfmLink).props.url;
			const key = removeHash(url);

			// Keep the first match only, to preserve existing behavior.
			if (!urls.has(key)) {
				urls.set(key, url);
			}
		}
	}

	return Array.from(urls.values());
}
