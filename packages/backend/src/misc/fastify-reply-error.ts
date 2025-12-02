/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// https://www.fastify.io/docs/latest/Reference/Reply/#async-await-and-promises
export class FastifyReplyError extends Error {
	// Fix the error name in stack traces - https://stackoverflow.com/a/71573071
	override name = this.constructor.name;

	public message: string;
	public statusCode: number;

	constructor(statusCode: number, message: string, cause?: unknown) {
		super(message, cause ? { cause } : undefined);
		this.message = message;
		this.statusCode = statusCode;
	}
}
