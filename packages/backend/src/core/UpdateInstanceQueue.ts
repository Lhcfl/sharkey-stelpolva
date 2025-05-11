/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { CollapsedQueue } from '@/misc/collapsed-queue.js';
import { bindThis } from '@/decorators.js';
import { MiNote } from '@/models/Note.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';

type UpdateInstanceJob = {
	latestRequestReceivedAt: Date,
	shouldUnsuspend: boolean,
};

// Moved from InboxProcessorService to allow access from ApInboxService
@Injectable()
export class UpdateInstanceQueue extends CollapsedQueue<MiNote['id'], UpdateInstanceJob> implements OnApplicationShutdown {
	constructor(
		private readonly federatedInstanceService: FederatedInstanceService,
	) {
		super(process.env.NODE_ENV !== 'test' ? 60 * 1000 * 5 : 0, (id, job) => this.collapseUpdateInstanceJobs(id, job), (id, job) => this.performUpdateInstance(id, job));
	}

	@bindThis
	private collapseUpdateInstanceJobs(oldJob: UpdateInstanceJob, newJob: UpdateInstanceJob) {
		const latestRequestReceivedAt = oldJob.latestRequestReceivedAt < newJob.latestRequestReceivedAt
			? newJob.latestRequestReceivedAt
			: oldJob.latestRequestReceivedAt;
		const shouldUnsuspend = oldJob.shouldUnsuspend || newJob.shouldUnsuspend;
		return {
			latestRequestReceivedAt,
			shouldUnsuspend,
		};
	}

	@bindThis
	private async performUpdateInstance(id: string, job: UpdateInstanceJob) {
		await this.federatedInstanceService.update(id, {
			latestRequestReceivedAt: new Date(),
			isNotResponding: false,
			// もしサーバーが死んでるために配信が止まっていた場合には自動的に復活させてあげる
			suspensionState: job.shouldUnsuspend ? 'none' : undefined,
		});
	}

	@bindThis
	async onApplicationShutdown() {
		await this.performAllNow();
	}
}
