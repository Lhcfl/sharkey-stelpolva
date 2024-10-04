/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { instance } from '@/instance.js';
import { defaultStore } from '@/store.js';
import * as os from '@/os.js';
import MkUrlWarningDialog from '@/components/MkUrlWarningDialog.vue';

const extractDomain = /^(https?:\/\/|\/\/)?([^@/\s]+@)?(www\.)?([^:/\s]+)/i;
const isRegExp = /^\/(.+)\/(.*)$/;

export async function warningExternalWebsite(url: string) {
	const domain = extractDomain.exec(url)?.[4];

	if (!domain) return false;

	const isTrustedByInstance = instance.trustedLinkUrlPatterns.some(expression => {
		const r = isRegExp.exec(expression);

		if (r) {
			return new RegExp(r[1], r[2]).test(url);
		} else if (expression.includes(' ')) return expression.split(' ').every(keyword => url.includes(keyword));
		else return domain.endsWith(expression);
	});

	const isTrustedByUser = defaultStore.reactiveState.trustedDomains.value.includes(domain);

	if (!isTrustedByInstance && !isTrustedByUser) {
		const confirm = await new Promise<{ canceled: boolean }>(resolve => {
			const { dispose } = os.popup(MkUrlWarningDialog, {
				url,
			}, {
				done: result => {
					resolve(result ? result : { canceled: true });
				},
				closed: () => dispose(),
			});
		});

		if (confirm.canceled) return false;

		window.open(url, '_blank', 'nofollow noopener popup=false');
	}

	return true;
}
