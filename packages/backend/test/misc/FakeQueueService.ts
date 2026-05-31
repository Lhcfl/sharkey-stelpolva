/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ModuleRef } from '@nestjs/core';
import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Config } from '@/config.js';
import type { BackgroundTaskJobData } from '@/queue/types.js';
import { BackgroundTaskProcessorService } from '@/queue/processors/BackgroundTaskProcessorService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { TimeService } from '@/global/TimeService.js';
import { QueueService } from '@/core/QueueService.js';
import { EnvService } from '@/global/EnvService.js';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';

@Injectable()
export class FakeQueueService extends QueueService implements OnApplicationBootstrap {
	private backgroundTaskProcessorService: BackgroundTaskProcessorService;

	constructor(
		@Inject(ModuleRef)
		moduleRef: ModuleRef,

		@Inject(DI.config)
		config: Config,

		@Inject(TimeService)
		timeService: TimeService,

		@Inject(EnvService)
		envService: EnvService,

		@Inject(LoggerService)
		loggerService: LoggerService,
	) {
		super(moduleRef, config, timeService, envService, loggerService);
	}

	@bindThis
	public override async onApplicationBootstrap(): Promise<void> {
		await super.onApplicationBootstrap();

		// Use "create" because it's defined in another module
		this.backgroundTaskProcessorService = await this.moduleRef.create(BackgroundTaskProcessorService);
	}

	@bindThis
	protected override async createBackgroundTask(data: BackgroundTaskJobData): Promise<void> {
		await this.backgroundTaskProcessorService.process(data);
	}
}
