/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Bull from 'bullmq';
import { Not } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { InstancesRepository, MiMeta } from '@/models/_.js';
import type Logger from '@/logger.js';
import { ApRequestService } from '@/core/activitypub/ApRequestService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { FetchInstanceMetadataService } from '@/core/FetchInstanceMetadataService.js';
import { MemorySingleCache } from '@/misc/cache.js';
import type { MiInstance } from '@/models/Instance.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import ApRequestChart from '@/core/chart/charts/ap-request.js';
import FederationChart from '@/core/chart/charts/federation.js';
import { StatusError } from '@/misc/status-error.js';
import { UtilityService } from '@/core/UtilityService.js';
import { TimeService } from '@/global/TimeService.js';
import { bindThis } from '@/decorators.js';
import { QueueService } from '@/core/QueueService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type { DeliverJobData } from '../types.js';

@Injectable()
export class DeliverProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		private utilityService: UtilityService,
		private federatedInstanceService: FederatedInstanceService,
		private fetchInstanceMetadataService: FetchInstanceMetadataService,
		private apRequestService: ApRequestService,
		private instanceChart: InstanceChart,
		private apRequestChart: ApRequestChart,
		private federationChart: FederationChart,
		private queueLoggerService: QueueLoggerService,
		private readonly timeService: TimeService,
		private readonly queueService: QueueService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('deliver');
	}

	@bindThis
	public async process(job: Bull.Job<DeliverJobData>): Promise<string> {
		const host = this.utilityService.extractDbHost(job.data.to);

		if (!this.utilityService.isFederationAllowedUri(job.data.to)) {
			return 'skip (blocked)';
		}

		const i = await this.federatedInstanceService.federatedInstanceCache.fetch(host);
		if (i.suspensionState !== 'none') {
			return 'skip (suspended)';
		}

		// Make sure info is up-to-date.
		await this.fetchInstanceMetadataService.fetchInstanceMetadata(i);

		// suspend server by software.
		if (i != null && this.utilityService.isDeliverSuspendedSoftware(i)) {
			return 'skip (software suspended)';
		}

		try {
			await this.apRequestService.signedPost(job.data.user, job.data.to, job.data.content, job.data.digest);

			// Update instance stats
			await this.queueService.createPostDeliverJob(host, 'success');

			return 'Success';
		} catch (res) {
			// Update instance stats
			const isPerm = job.data.isSharedInbox && res instanceof StatusError && res.statusCode === 410;
			await this.queueService.createPostDeliverJob(host, isPerm ? 'perm-fail' : 'temp-fail');

			if (res instanceof StatusError && !res.isRetryable) {
				// 4xx
				// 相手が閉鎖していることを明示しているため、配送停止する
				if (job.data.isSharedInbox && res.statusCode === 410) {
					throw new Bull.UnrecoverableError(`${host} is gone`);
				}
				throw new Bull.UnrecoverableError(`${res.statusCode} ${res.statusMessage}`);
			} else {
				// DNS error, socket error, timeout ...
				throw res;
			}
		}
	}
}
