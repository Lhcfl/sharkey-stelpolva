/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppLockService } from '@/core/AppLockService.js';
import { TimeService } from '@/global/TimeService.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import Chart from '../core.js';
import { ChartLoggerService } from '../ChartLoggerService.js';
import { name, schema } from './entities/ap-request.js';
import type { KVs } from '../core.js';

/**
 * Chart about ActivityPub requests
 */
@Injectable()
export default class ApRequestChart extends Chart<typeof schema> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		private appLockService: AppLockService,
		private chartLoggerService: ChartLoggerService,
		private readonly timeService: TimeService,
	) {
		super(db, (k) => appLockService.getChartInsertLock(k), chartLoggerService.logger, name, schema);
	}

	protected getCurrentDate(): Date {
		return this.timeService.date;
	}

	protected async tickMajor(): Promise<Partial<KVs<typeof schema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof schema>>> {
		return {};
	}

	@bindThis
	public deliverSucc(): void {
		this.commit({
			'deliverSucceeded': 1,
		});
	}

	@bindThis
	public deliverFail(): void {
		this.commit({
			'deliverFailed': 1,
		});
	}

	@bindThis
	public inbox(): void {
		this.commit({
			'inboxReceived': 1,
		});
	}
}
