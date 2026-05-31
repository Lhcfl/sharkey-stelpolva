/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors; originally based on code by syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Required, otherwise typeorm will "lose" all the included types!!
import type from 'fastify';
import type { OutgoingHttpHeaders } from 'node:http';

declare module 'fastify' {
	export type HttpHeader = keyof OmitIndexSignature<OutgoingHttpHeaders> | (string & Record<never, never>);
}
