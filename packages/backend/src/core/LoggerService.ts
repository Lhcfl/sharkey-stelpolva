/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import type { KEYWORD } from 'color-convert/conversions.js';
import { envOption } from '@/env.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';

@Injectable()
export class LoggerService {
	constructor(
		@Inject(DI.config)
		private config: Config,
	) {
	}

	@bindThis
	public getLogger(domain: string, color?: KEYWORD | undefined) {
		const verbose = this.config.logging?.verbose || envOption.verbose;
		return new Logger(domain, color, verbose);
	}
}
