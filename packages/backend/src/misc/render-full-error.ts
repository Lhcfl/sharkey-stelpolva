/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import { AbortError, FetchError } from 'node-fetch';
import { StatusError } from '@/misc/status-error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { CaptchaError, captchaErrorCodes } from '@/core/CaptchaService.js';

export function renderFullError(e?: unknown): unknown {
	if (e === undefined) return 'undefined';
	if (e === null) return 'null';

	if (e instanceof Error) {
		if (isSimpleError(e)) {
			return renderInlineError(e);
		}

		const data: ErrorData = {};
		if (e.stack) data.stack = e.stack;
		if (e.message) data.message = e.message;
		if (e.name) data.name = e.name;

		// mix "cause" and "errors"
		if (e instanceof AggregateError && e.errors.length > 0) {
			const causes = e.errors.map(inner => renderFullError(inner));
			if (e.cause) {
				causes.push(renderFullError(e.cause));
			}
			data.cause = causes;
		} else if (e.cause) {
			data.cause = renderFullError(e.cause);
		}

		return data;
	}

	return e;
}

function isSimpleError(e: Error): boolean {
	if (e instanceof Bull.UnrecoverableError) return true;
	if (e instanceof AbortError || e.name === 'AbortError') return true;
	if (e instanceof FetchError || e.name === 'FetchError') return true;
	if (e instanceof StatusError) return true;
	if (e instanceof IdentifiableError) return true;
	if (e instanceof FetchError) return true;
	if (e instanceof CaptchaError && e.code !== captchaErrorCodes.unknown) return true;
	return false;
}

interface ErrorData {
	stack?: Error['stack'];
	message?: Error['message'];
	name?: Error['name'];
	cause?: Error['cause'] | Error['cause'][];
}
