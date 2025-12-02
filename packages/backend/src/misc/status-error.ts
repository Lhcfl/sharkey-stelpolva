/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class StatusError extends Error {
	// Fix the error name in stack traces - https://stackoverflow.com/a/71573071
	override name = this.constructor.name;

	public statusCode: number;
	public statusMessage?: string;
	public isClientError: boolean;
	public isRetryable: boolean;

	constructor(message: string, statusCode: number, statusMessage?: string, cause?: unknown) {
		super(message, cause ? { cause } : undefined);
		this.name = 'StatusError';
		this.statusCode = statusCode;
		this.statusMessage = statusMessage;
		this.isClientError = typeof this.statusCode === 'number' && this.statusCode >= 400 && this.statusCode < 500;
		this.isRetryable = !this.isClientError || this.statusCode === 429;
	}
}
