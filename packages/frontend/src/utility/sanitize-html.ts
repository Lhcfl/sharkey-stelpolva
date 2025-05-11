/*
 * SPDX-FileCopyrightText: dakkar and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
*/

import original from 'sanitize-html';

export default function sanitizeHtml(str: string | null): string | null {
	if (str == null) return str;
	return original(str, {
		allowedTags: original.defaults.allowedTags.concat(['img', 'audio', 'video', 'center', 'details', 'summary']),
		allowedAttributes: {
			...original.defaults.allowedAttributes,
			a: original.defaults.allowedAttributes.a.concat(['style']),
			img: original.defaults.allowedAttributes.img.concat(['style']),
			'*': (original.defaults.allowedAttributes['*'] || []).concat(['style']),
		},
	});
}
