/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull, MoreThan } from 'typeorm';
import { CacheManagementService, type ManagedMemorySingleCache } from '@/global/CacheManagementService.js';
import NotesChart from '@/core/chart/charts/notes.js';
import UsersChart from '@/core/chart/charts/users.js';
import { DI } from '@/di-symbols.js';
import type { UsersRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { TimeService } from '@/global/TimeService.js';

export interface InstanceStats {
	/**
	 * The number of local posts on the instance.
	 * Updated hourly.
	 */
	notesTotal: number;

	/**
	 * The number of local users currently registered on the instance.
	 * Updated hourly.
	 */
	usersTotal: number;

	/**
	 * The number of local users who have been active within the past month.
	 * Updated daily.
	 */
	usersActiveMonth: number;

	/**
	 * The number of local users who have been active within the past 6 months.
	 * Updated weekly.
	 */
	usersActiveSixMonths: number;
}

@Injectable()
export class InstanceStatsService {
	private readonly activeSixMonthsCache: ManagedMemorySingleCache<number>;
	private readonly activeMonthCache: ManagedMemorySingleCache<number>;
	private readonly localUsersCache: ManagedMemorySingleCache<number>;
	private readonly localPostsCache: ManagedMemorySingleCache<number>;

	constructor(
		@Inject(DI.usersRepository)
		private readonly usersRepository: UsersRepository,

		private readonly notesChart: NotesChart,
		private readonly usersChart: UsersChart,
		private readonly timeService: TimeService,

		cacheManagementService: CacheManagementService,
	) {
		this.localPostsCache = cacheManagementService.createMemorySingleCache<number>('localPosts', 1000 * 60 * 60); // 1h
		this.localUsersCache = cacheManagementService.createMemorySingleCache<number>('localUsers', 1000 * 60 * 60); // 1h
		this.activeMonthCache = cacheManagementService.createMemorySingleCache<number>('activeMonth', 1000 * 60 * 60 * 24); // 1d
		this.activeSixMonthsCache = cacheManagementService.createMemorySingleCache<number>('activeSixMonths', 1000 * 60 * 60 * 24 * 7); // 1w
	}

	@bindThis
	public async fetch(): Promise<InstanceStats> {
		const [notesTotal, usersTotal, usersActiveMonth, usersActiveSixMonths] = await Promise.all([
			this.fetchLocalPosts(),
			this.fetchLocalUsers(),
			this.fetchActiveMonth(),
			this.fetchActiveSixMonths(),
		]);
		return { notesTotal, usersTotal, usersActiveMonth, usersActiveSixMonths };
	}

	@bindThis
	private async fetchActiveSixMonths(): Promise<number> {
		return await this.activeSixMonthsCache.fetch(async () => {
			const now = this.timeService.now;
			const halfYearAgo = new Date(now - 15552000000);
			return await this.usersRepository.countBy({
				host: IsNull(),
				isBot: false,
				lastActiveDate: MoreThan(halfYearAgo),
			});
		});
	}

	@bindThis
	private async fetchActiveMonth(): Promise<number> {
		return await this.activeMonthCache.fetch(async () => {
			const now = this.timeService.now;
			const halfYearAgo = new Date(now - 2592000000);
			return await this.usersRepository.countBy({
				host: IsNull(),
				isBot: false,
				lastActiveDate: MoreThan(halfYearAgo),
			});
		});
	}

	@bindThis
	private async fetchLocalUsers(): Promise<number> {
		return await this.localUsersCache.fetch(async () => {
			const chart = await this.usersChart.getChart('hour', 1, null);
			return chart.local.total[0];
		});
	}

	@bindThis
	private async fetchLocalPosts(): Promise<number> {
		return await this.localPostsCache.fetch(async () => {
			const chart = await this.notesChart.getChart('hour', 1, null);
			return chart.local.total[0];
		});
	}
}
