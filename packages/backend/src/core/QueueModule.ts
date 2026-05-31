/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	Global,
	Module,
	Inject,
	type Import,
	type Provider,
	type OnApplicationShutdown,
	type InjectionToken,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import * as Bull from 'bullmq';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { Logger } from '@/logger.js';
import { EnvService } from '@/global/EnvService.js';
import { GlobalModule } from '@/GlobalModule.js';
import { LoggerService } from '@/core/LoggerService.js';
import { getQueueOptions, QUEUE_TYPES } from '@/queue/const.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { allSettled } from '@/misc/promise-tracker.js';
import { promiseTry } from '@/misc/promise-try.js';
import { bindThis } from '@/decorators.js';

const queueLoggerDI = Symbol('queueLogger');
const $queueLogger: Provider = {
	provide: queueLoggerDI,
	useFactory: (loggerService: LoggerService) => loggerService.getLogger('queue'),
	inject: [LoggerService],
};

// TODO factor the "alias with warning" logic into something re-usable
function makeAliasProvider(from: InjectionToken, to: InjectionToken): Provider {
	return {
		provide: from,
		useFactory: (envService: EnvService, logger: Logger, actual: unknown) => {
			// Log a warning in non-production environments
			if (envService.env.NODE_ENV !== 'production') {
				// noinspection SuspiciousTypeOfGuard <- WebStorm doesn't recognize symbol types
				const fromLabel = typeof(from) === 'symbol' ? `Symbol(${from.description ?? '?'})` : String(from);
				// noinspection SuspiciousTypeOfGuard <- WebStorm doesn't recognize symbol types
				const toLabel = typeof(to) === 'symbol' ? `Symbol(${to.description ?? '?'})` : String(to);
				logger.warn(`Detected incorrect use of DI alias "${fromLabel}" - please use canonical token "${toLabel}" instead.`);
			}

			return actual;
		},
		inject: [EnvService, queueLoggerDI, to],
	};
}

const $queues: Provider[] = QUEUE_TYPES.flatMap(qt => {
	const queueDI = `queue:${qt}`;
	const eventsDI = `queue:${qt}:events`;
	return [
		// Queue instance
		{
			provide: queueDI,
			useFactory: (config: Config) => new Bull.Queue(qt, getQueueOptions(config, qt)),
			inject: [DI.config],
		},
		// Event connection
		{
			provide: `queue:${qt}:events`,
			useFactory: (config: Config) => new Bull.QueueEvents(qt, getQueueOptions(config, qt)),
			inject: [DI.config],
		},
		makeAliasProvider(`queues:${qt}`, queueDI),
		makeAliasProvider(`queues:${qt}:events`, eventsDI),
		makeAliasProvider(`queues:${qt}:event`, eventsDI),
		makeAliasProvider(`queue:${qt}:event`, eventsDI),
	];
});

/** External module dependencies */
const $Imports = [
	GlobalModule,
] as const satisfies Import[];

@Global()
@Module({
	imports: $Imports,
	providers: [
		$queues,
		$queueLogger,
	].flat(),
	exports: [
		$queues,
		$Imports,
	].flat(),
})
export class QueueModule implements OnApplicationShutdown {
	constructor(
		private readonly moduleRef: ModuleRef,

		@Inject(queueLoggerDI)
		private readonly logger: Logger,
	) {}

	@bindThis
	public async onApplicationShutdown(): Promise<void> {
		// Wait for all potential queue jobs
		this.logger.info('Finalizing active promises...');
		await allSettled();

		// And then close all queues in parallel
		this.logger.info('Closing BullMQ queue connections...');
		// TODO move QUEUE_TYPES to this class
		const tasks = QUEUE_TYPES.flatMap(qt => [
			promiseTry(() => this.moduleRef.get<Bull.Queue>(`queue:${qt}`).disconnect())
				.catch(err => this.logger.error(`Error closing queue ${qt}: ${renderInlineError(err)}`)),
			promiseTry(() => this.moduleRef.get<Bull.QueueEvents>(`queue:${qt}:events`).disconnect())
				.catch(err => this.logger.error(`Error closing events for queue ${qt}: ${renderInlineError(err)}`)),
		]);
		await Promise.all(tasks);
		this.logger.info('Queue module disposed.');
	}
}
