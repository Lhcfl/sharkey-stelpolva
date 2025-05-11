/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

export function showSystemAccountDialog(): Promise<void> {
	return os.alert({
		type: 'error',
		title: i18n.ts.systemAccountTitle,
		text: i18n.ts.systemAccountDescription,
	});
}
