/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors; originally based on code by syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Required, otherwise typeorm will "lose" all the included types!!
import type from 'typeorm';

declare module 'typeorm' {
	export type PartialEntityUpdate<T extends ObjectLiteral> = {
		[K in keyof T]?: T[K] | (() => string);
	};
}
