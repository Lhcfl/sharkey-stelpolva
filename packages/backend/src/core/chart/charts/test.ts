/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppLockService } from '@/core/AppLockService.js';
import { DI } from '@/di-symbols.js';
import Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { TimeService } from '@/global/TimeService.js';
import Chart from '../core.js';
import { name, schema } from './entities/test.js';
import type { KVs } from '../core.js';

/**
 * For testing
 */
@Injectable()
export default class TestChart extends Chart<typeof schema> { // eslint-disable-line import/no-default-export
	public total = 0; // publicにするのはテストのため

	constructor(
		@Inject(DI.db)
		private db: DataSource,

		private appLockService: AppLockService,
		private readonly timeService: TimeService,

		logger: Logger,
	) {
		super(db, (k) => appLockService.getChartInsertLock(k), logger, name, schema);
	}

	protected getCurrentDate(): Date {
		return this.timeService.date;
	}

	protected async tickMajor(): Promise<Partial<KVs<typeof schema>>> {
		return {
			'foo.total': this.total,
		};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof schema>>> {
		return {};
	}

	@bindThis
	public increment(): void {
		this.total++;

		this.commit({
			'foo.total': 1,
			'foo.inc': 1,
		});
	}

	@bindThis
	public decrement(): void {
		this.total--;

		this.commit({
			'foo.total': -1,
			'foo.dec': 1,
		});
	}
}
