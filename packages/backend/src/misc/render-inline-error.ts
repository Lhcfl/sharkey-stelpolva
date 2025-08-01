/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IdentifiableError } from '@/misc/identifiable-error.js';
import { StatusError } from '@/misc/status-error.js';
import { CaptchaError } from '@/misc/captcha-error.js';

export function renderInlineError(err: unknown): string {
	const parts: string[] = [];
	renderTo(err, parts);
	return parts.join('');
}

function renderTo(err: unknown, parts: string[]): void {
	parts.push(printError(err));

	if (err instanceof AggregateError) {
		for (let i = 0; i < err.errors.length; i++) {
			parts.push(` [${i + 1}/${err.errors.length}]: `);
			renderTo(err.errors[i], parts);
		}
	}

	if (err instanceof Error) {
		if (err.cause) {
			parts.push(' [caused by]: ');
			renderTo(err.cause, parts);
			// const cause = renderInlineError(err.cause);
			// parts.push(' [caused by]: ', cause);
		}
	}
}

function printError(err: unknown): string {
	if (err === undefined) return 'undefined';
	if (err === null) return 'null';

	if (err instanceof IdentifiableError) {
		if (err.message) {
			return `${err.name} ${err.id}: ${err.message}`;
		} else {
			return `${err.name} ${err.id}`;
		}
	}

	if (err instanceof StatusError) {
		if (err.message) {
			return `${err.name} ${err.statusCode}: ${err.message}`;
		} else if (err.statusMessage) {
			return `${err.name} ${err.statusCode}: ${err.statusMessage}`;
		} else {
			return `${err.name} ${err.statusCode}`;
		}
	}

	if (err instanceof CaptchaError) {
		if (err.code.description) {
			return `${err.name} ${err.code.description}: ${err.message}`;
		} else {
			return `${err.name}: ${err.message}`;
		}
	}

	if (err instanceof Error) {
		if (err.message) {
			return `${err.name}: ${err.message}`;
		} else {
			return err.name;
		}
	}

	return String(err);
}
