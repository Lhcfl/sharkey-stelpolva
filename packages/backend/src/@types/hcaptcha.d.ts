/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Required, otherwise typeorm will "lose" all the included types!!
import type from 'hcaptcha';

declare module 'hcaptcha' {
	interface IVerifyResponse {
		success: boolean;
		challenge_ts: string;
		hostname: string;
		credit?: boolean;
		'error-codes'?: unknown[];
	}

	export function verify(secret: string, token: string): Promise<IVerifyResponse>;
}
