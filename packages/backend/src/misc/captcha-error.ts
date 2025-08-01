/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { CaptchaErrorCode } from '@/core/CaptchaService.js';

export class CaptchaError extends Error {
	public readonly code: CaptchaErrorCode;
	public readonly cause?: unknown;

	constructor(code: CaptchaErrorCode, message: string, cause?: unknown) {
		super(message, cause ? { cause } : undefined);
		this.code = code;
		this.cause = cause;
		this.name = 'CaptchaError';
	}
}
