/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors; originally based on code by syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Required, otherwise typeorm will "lose" all the included types!!
import type from '@nestjs/common';
import type { ModuleMetadata, DynamicModule, ForwardReference, Type } from '@nestjs/common';

declare module '@nestjs/common' {
	export type Import = NonNullable<ModuleMetadata['imports']>[number];
	export type IEntryNestModule = Type<unknown> | DynamicModule | ForwardReference | Promise<IEntryNestModule>;
}
