/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppLockService } from '@/core/AppLockService.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { TimeService } from '@/global/TimeService.js';
import Chart from '../core.js';
import { ChartLoggerService } from '../ChartLoggerService.js';
import { name, schema } from './entities/active-users.js';
import type { KVs } from '../core.js';

const week = 1000 * 60 * 60 * 24 * 7;
const month = 1000 * 60 * 60 * 24 * 30;
const year = 1000 * 60 * 60 * 24 * 365;

/**
 * アクティブユーザーに関するチャート
 */
@Injectable()
export default class ActiveUsersChart extends Chart<typeof schema> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		private appLockService: AppLockService,
		private chartLoggerService: ChartLoggerService,
		private idService: IdService,
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
	public read(user: { id: MiUser['id'], host: null }): void {
		const createdAt = this.idService.parse(user.id).date;
		this.commit({
			'read': [user.id],
			'registeredWithinWeek': (this.timeService.now - createdAt.getTime() < week) ? [user.id] : [],
			'registeredWithinMonth': (this.timeService.now - createdAt.getTime() < month) ? [user.id] : [],
			'registeredWithinYear': (this.timeService.now - createdAt.getTime() < year) ? [user.id] : [],
			'registeredOutsideWeek': (this.timeService.now - createdAt.getTime() > week) ? [user.id] : [],
			'registeredOutsideMonth': (this.timeService.now - createdAt.getTime() > month) ? [user.id] : [],
			'registeredOutsideYear': (this.timeService.now - createdAt.getTime() > year) ? [user.id] : [],
		});
	}

	@bindThis
	public write(user: { id: MiUser['id'], host: null }): void {
		this.commit({
			'write': [user.id],
		});
	}
}
