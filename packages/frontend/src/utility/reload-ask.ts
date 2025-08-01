/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { unisonReload } from '@/utility/unison-reload.js';

let isReloadConfirming = false;

export async function reloadAsk(opts: {
	unison?: boolean;
	reason?: string;
	type?: 'error' | 'info' | 'success' | 'warning' | 'waiting' | 'question';
	title?: string;
	okText?: string;
	cancelText?: string;
}) {
	if (isReloadConfirming) {
		return;
	}

	isReloadConfirming = true;

	const { canceled } = await os.confirm({
		type: opts.type ?? 'question',
		title: opts.title ?? i18n.ts.reloadConfirm,
		text: opts.reason ?? undefined,
		okText: opts.okText ?? i18n.ts.yes,
		cancelText: opts.cancelText ?? i18n.ts.no,
	}).finally(() => {
		isReloadConfirming = false;
	});

	if (canceled) return;

	if (opts.unison) {
		unisonReload();
	} else {
		window.location.reload();
	}
}
