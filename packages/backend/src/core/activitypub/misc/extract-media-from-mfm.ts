/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { parse, inspect, extract } from 'mfm-js';
import type { IApDocument } from '@/core/activitypub/type.js';
import type { MfmNode, MfmText } from 'mfm-js';

/**
 * Finds MFM notes representing inline media and returns them as simulated AP documents.
 * Returns an empty array if the input cannot be parsed, or no media was found.
 * @param mfm Input MFM to analyze.
 */
export function extractMediaFromMfm(mfm: string): IApDocument[] {
	const nodes = parseMfm(mfm);
	if (nodes == null) return [];

	const attachments = new Map<string, IApDocument>();

	inspect(nodes, node => {
		if (node.type === 'link' && node.props.image) {
			const alt: string[] = [];

			inspect(node.children, node => {
				switch (node.type) {
					case 'text':
						alt.push(node.props.text);
						break;
					case 'unicodeEmoji':
						alt.push(node.props.emoji);
						break;
					case 'emojiCode':
						alt.push(':');
						alt.push(node.props.name);
						alt.push(':');
						break;
				}
			});

			attachments.set(node.props.url, {
				type: 'Image',
				url: node.props.url,
				name: alt.length > 0
					? alt.join('')
					: null,
			});
		}
	});

	return Array.from(attachments.values());
}

function parseMfm(mfm: string): MfmNode[] | null {
	try {
		return parse(mfm);
	} catch {
		// Don't worry about invalid MFM
		return null;
	}
}
