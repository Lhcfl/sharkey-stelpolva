/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import Logger from '@/logger.js';
import { TimeService } from '@/global/TimeService.js';
import { EnvService } from '@/global/EnvService.js';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import type { KEYWORD } from 'color-convert/conversions.js';

@Injectable()
export class LoggerService {
	constructor(
		@Inject(DI.console)
		protected readonly console: Console,

		protected readonly timeService: TimeService,
		protected readonly envService: EnvService,
	) {
	}

	@bindThis
	public getLogger(domain: string, color?: KEYWORD | undefined) {
		return new Logger(domain, color, this.envService, this.timeService, this.console);
	}
}
