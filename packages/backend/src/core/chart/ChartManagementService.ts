/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, type BeforeApplicationShutdown, type OnApplicationBootstrap } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import { ChartLoggerService } from '@/core/chart/ChartLoggerService.js';
import { TimeService, type TimerHandle } from '@/global/TimeService.js';
import { EnvService } from '@/global/EnvService.js';
import type { Logger } from '@/logger.js';
import type { IChart } from '@/core/chart/core.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import FederationChart from './charts/federation.js';
import NotesChart from './charts/notes.js';
import UsersChart from './charts/users.js';
import ActiveUsersChart from './charts/active-users.js';
import InstanceChart from './charts/instance.js';
import PerUserNotesChart from './charts/per-user-notes.js';
import PerUserPvChart from './charts/per-user-pv.js';
import DriveChart from './charts/drive.js';
import PerUserReactionsChart from './charts/per-user-reactions.js';
import PerUserFollowingChart from './charts/per-user-following.js';
import PerUserDriveChart from './charts/per-user-drive.js';
import ApRequestChart from './charts/ap-request.js';

@Injectable()
export class ChartManagementService implements BeforeApplicationShutdown, OnApplicationBootstrap {
	private saveIntervalId: TimerHandle;
	private readonly logger: Logger;
	private readonly charts: IChart[];

	constructor(
		private federationChart: FederationChart,
		private notesChart: NotesChart,
		private usersChart: UsersChart,
		private activeUsersChart: ActiveUsersChart,
		private instanceChart: InstanceChart,
		private perUserNotesChart: PerUserNotesChart,
		private perUserPvChart: PerUserPvChart,
		private driveChart: DriveChart,
		private perUserReactionsChart: PerUserReactionsChart,
		private perUserFollowingChart: PerUserFollowingChart,
		private perUserDriveChart: PerUserDriveChart,
		private apRequestChart: ApRequestChart,
		private readonly timeService: TimeService,
		private readonly envService: EnvService,

		chartLoggerService: ChartLoggerService,
	) {
		this.charts = [
			this.federationChart,
			this.notesChart,
			this.usersChart,
			this.activeUsersChart,
			this.instanceChart,
			this.perUserNotesChart,
			this.perUserPvChart,
			this.driveChart,
			this.perUserReactionsChart,
			this.perUserFollowingChart,
			this.perUserDriveChart,
			this.apRequestChart,
		];
		this.logger = chartLoggerService.logger;
	}

	@bindThis
	public onApplicationBootstrap(): void {
		if (this.envService.env.NODE_ENV === 'test') {
			this.logger.debug('Skipping startup; ChartManagementService disabled in TEST environment.');
			return;
		}

		this.start();
	}

	@bindThis
	private start(): void {
		// TODO random offset so different processes don't clash
		// 20分おきにメモリ情報をDBに書き込み
		this.saveIntervalId = this.timeService.startTimer(async () => {
			await this.saveAll('timer');
		}, 1000 * 60 * 20, { repeated: true });

		this.logger.debug('Started ChartManagementService timer.');
	}

	@bindThis
	private async dispose(): Promise<void> {
		this.timeService.stopTimer(this.saveIntervalId);
		this.logger.debug('Stopped ChartManagementService timer.');

		await this.saveAll('shutdown');
	}

	@bindThis
	private async saveAll(reason: string): Promise<void> {
		this.logger.info(`Saving charts for ${reason}...`);
		for (const chart of this.charts) {
			try {
				await chart.save();
			} catch (err) {
				this.logger.error(`Error saving chart: ${renderInlineError(err)}`);
			}
		}
		this.logger.info('All charts saved');
	}

	@bindThis
	public async beforeApplicationShutdown(): Promise<void> {
		if (this.envService.env.NODE_ENV === 'test') {
			this.logger.debug('Skipping shutdown; ChartManagementService disabled in TEST environment.');
			return;
		}

		await this.dispose();
	}
}
