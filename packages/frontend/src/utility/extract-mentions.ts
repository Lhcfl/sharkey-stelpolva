/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { acct } from 'misskey-js';
import { toASCII } from 'punycode.js';
import * as mfm from 'mfm-js';
import * as config from '@@/js/config.js';

export type MfmMention = mfm.MfmMention['props'];

const localHost = normalize(config.host);

/**
 * Extracts unique, deduplicated, and host-normalized mentions from a chunk of MFM.
 * Keep in sync with backend MfmService.extractMentions
 * @param nodes MFM nodes to search.
 * @param selfHost How to interpret "local" mentions (without a host).
 */
export function extractMentions(nodes: mfm.MfmNode[], selfHost: string | null = null): MfmMention[] {
	if (nodes.length < 1) return [];

	const normalSelfHost = selfHost != null ? normalize(selfHost) : null;
	const mentionNodes = mfm.extract(nodes, (node) => node.type === 'mention') as mfm.MfmMention[];
	const mentions = mentionNodes.map(({ props: mention }) => {
		// Normalize hostnames
		const normalHost = mention.host != null ? normalize(mention.host) : null;
		if (normalHost == null) {
			mention.host = normalSelfHost; // replace null with the actual origin
		} else if (normalHost === localHost) {
			mention.host = null; // replace local host with null
		} else {
			mention.host = normalHost; // preserve other hosts
		}

		// Normalize the acct form in case of weirdness from MFM
		mention.acct = acct.toString(mention);

		// Generate a further-normalized key
		const key = mention.acct.toLowerCase();
		return [key, mention] as const;
	});

	// Deduplicate the list, but preserve the as-entered mentions.
	return Array.from(new Map(mentions).values());
}

function normalize(host: string): string {
	return toASCII(host).toLowerCase();
}
