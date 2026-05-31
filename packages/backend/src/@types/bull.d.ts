/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors; originally based on code by syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Required, otherwise typeorm will "lose" all the included types!!
import type from 'bullmq'
import type { Job } from 'bullmq';

declare module 'bullmq' {
	export type ExtractDataType<DataTypeOrJob, Default> = DataTypeOrJob extends Job<infer D, any, any> ? D : Default;
	export type ExtractNameType<DataTypeOrJob, Default extends string> = DataTypeOrJob extends Job<any, any, infer N> ? N : Default;
}
