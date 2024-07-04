/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from '@transfem-org/sfm-js';

export function checkAnimationFromMfm(nodes: mfm.MfmNode[]): boolean {
	const animatedNodes = mfm.extract(nodes, (node) => {
		if (node.type === 'fn') {
			if (node.props.name === 'tada' ||
			node.props.name === 'jelly' ||
			node.props.name === 'twitch' ||
			node.props.name === 'shake' ||
			node.props.name === 'spin' ||
			node.props.name === 'jump' ||
			node.props.name === 'bounce' ||
			node.props.name === 'rainbow' ||
			node.props.name === 'sparkle' ||
			node.props.name === 'fade' ||
			node.props.name === 'followmouse') {
				return true;
			} else {
				return false;
			}
		} else {
			return false;
		}
	});

	if (animatedNodes.length > 0) {
		return true;
	} else {
		return false;
	}
}
