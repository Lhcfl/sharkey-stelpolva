/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { coreEnvService } from '@/boot/coreLogger.js';

export function checkHttps(url: string): boolean {
	return url.startsWith('https://') ||
		(url.startsWith('http://') && coreEnvService.env.NODE_ENV !== 'production');
}
