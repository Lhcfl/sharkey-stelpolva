/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';

export class I18n<T extends Record<string, any>> {
	private readonly logger: Logger;
	public locale: T;

	constructor(
		loggerService: LoggerService,
		locale: T,
	) {
		this.logger = loggerService.getLogger('i18n');
		this.locale = locale;

		//#region BIND
		//this.t = this.t.bind(this);
		//#endregion
	}

	// string にしているのは、ドット区切りでのパス指定を許可するため
	// なるべくこのメソッド使うよりもlocale直接参照の方がvueのキャッシュ効いてパフォーマンスが良いかも
	public t(key: string, args?: Record<string, any>): string {
		try {
			let str = key.split('.').reduce((o, i) => o[i], this.locale as any) as string;

			if (args) {
				for (const [k, v] of Object.entries(args)) {
					str = str.replace(`{${k}}`, v);
				}
			}
			return str;
		} catch {
			this.logger.warn(`missing localization '${key}'`);
			return key;
		}
	}
}
