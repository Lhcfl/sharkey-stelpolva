/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '@/queue/QueueLoggerService.js';
import Logger from '@/logger.js';
import { ApLogService } from '@/core/ApLogService.js';

@Injectable()
export class CleanupApLogsProcessorService {
	private readonly logger: Logger;

	constructor(
		private readonly apLogService: ApLogService,
		queueLoggerService: QueueLoggerService,
	) {
		this.logger = queueLoggerService.logger.createSubLogger('activity-log-cleanup');
	}

	@bindThis
	public async process(): Promise<void> {
		try {
			const affected = await this.apLogService.deleteExpiredLogs();
			this.logger.info(`Activity Log cleanup complete; removed ${affected} expired logs.`);
		} catch (err) {
			this.logger.error('Activity Log cleanup failed:', err as Error);
		}
	}
}
