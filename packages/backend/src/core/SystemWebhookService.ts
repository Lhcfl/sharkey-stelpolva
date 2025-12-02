/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import type { MiUser, SystemWebhooksRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { GlobalEvents, GlobalEventService } from '@/core/GlobalEventService.js';
import { MiSystemWebhook, type SystemWebhookEventType } from '@/models/SystemWebhook.js';
import { IdService } from '@/core/IdService.js';
import { QueueService } from '@/core/QueueService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { LoggerService } from '@/core/LoggerService.js';
import Logger from '@/logger.js';
import { Packed } from '@/misc/json-schema.js';
import { AbuseReportResolveType } from '@/models/AbuseUserReport.js';
import { ModeratorInactivityRemainingTime } from '@/queue/processors/CheckModeratorsActivityProcessorService.js';
import { CacheManagementService, type ManagedMemorySingleCache } from '@/global/CacheManagementService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { TimeService } from '@/global/TimeService.js';
import type { OnApplicationShutdown } from '@nestjs/common';

export type AbuseReportPayload = {
	id: string;
	targetUserId: string;
	targetUser: Packed<'UserLite'> | null;
	targetUserHost: string | null;
	reporterId: string;
	reporter: Packed<'UserLite'> | null;
	reporterHost: string | null;
	assigneeId: string | null;
	assignee: Packed<'UserLite'> | null;
	resolved: boolean;
	forwarded: boolean;
	comment: string;
	moderationNote: string;
	resolvedAs: AbuseReportResolveType | null;
};

export type InactiveModeratorsWarningPayload = {
	remainingTime: ModeratorInactivityRemainingTime;
};

export type SystemWebhookPayload<T extends SystemWebhookEventType> =
	T extends 'abuseReport' | 'abuseReportResolved' ? AbuseReportPayload :
	T extends 'userCreated' ? Packed<'UserLite'> :
	T extends 'inactiveModeratorsWarning' ? InactiveModeratorsWarningPayload :
	T extends 'inactiveModeratorsInvitationOnlyChanged' ? Record<string, never> :
		never;

@Injectable()
export class SystemWebhookService implements OnApplicationShutdown {
	private readonly activeSystemWebhooks: ManagedMemorySingleCache<MiSystemWebhook[]>;

	constructor(
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,
		@Inject(DI.systemWebhooksRepository)
		private systemWebhooksRepository: SystemWebhooksRepository,
		private idService: IdService,
		private queueService: QueueService,
		private moderationLogService: ModerationLogService,
		private globalEventService: GlobalEventService,
		private readonly internalEventService: InternalEventService,
		private readonly timeService: TimeService,

		cacheManagementService: CacheManagementService,
	) {
		this.activeSystemWebhooks = cacheManagementService.createMemorySingleCache<MiSystemWebhook[]>('systemWebhooks', 1000 * 60 * 60 * 12); // 12h

		this.internalEventService.on('systemWebhookCreated', this.onWebhookEvent);
		this.internalEventService.on('systemWebhookUpdated', this.onWebhookEvent);
		this.internalEventService.on('systemWebhookDeleted', this.onWebhookEvent);
	}

	@bindThis
	public async fetchActiveSystemWebhooks() {
		return await this.activeSystemWebhooks.fetch(async () => {
			return await this.systemWebhooksRepository.findBy({
				isActive: true,
			});
		});
	}

	/**
	 * SystemWebhook の一覧を取得する.
	 */
	@bindThis
	public fetchSystemWebhooks(params?: {
		ids?: MiSystemWebhook['id'][];
		isActive?: MiSystemWebhook['isActive'];
		on?: MiSystemWebhook['on'];
	}): Promise<MiSystemWebhook[]> {
		const query = this.systemWebhooksRepository.createQueryBuilder('systemWebhook');
		if (params) {
			if (params.ids && params.ids.length > 0) {
				query.andWhere('systemWebhook.id IN (:...ids)', { ids: params.ids });
			}
			if (params.isActive !== undefined) {
				query.andWhere('systemWebhook.isActive = :isActive', { isActive: params.isActive });
			}
			if (params.on && params.on.length > 0) {
				query.andWhere(':on <@ systemWebhook.on', { on: params.on });
			}
		}

		return query.getMany();
	}

	/**
	 * SystemWebhook を作成する.
	 */
	@bindThis
	public async createSystemWebhook(
		params: {
			isActive: MiSystemWebhook['isActive'];
			name: MiSystemWebhook['name'];
			on: MiSystemWebhook['on'];
			url: MiSystemWebhook['url'];
			secret: MiSystemWebhook['secret'];
		},
		updater: MiUser,
	): Promise<MiSystemWebhook> {
		const id = this.idService.gen();
		await this.systemWebhooksRepository.insert({
			...params,
			id,
		});

		const webhook = await this.systemWebhooksRepository.findOneByOrFail({ id });
		await this.internalEventService.emit('systemWebhookCreated', { id: webhook.id });
		this.moderationLogService
			.log(updater, 'createSystemWebhook', {
				systemWebhookId: webhook.id,
				webhook: webhook,
			});

		return webhook;
	}

	/**
	 * SystemWebhook を更新する.
	 */
	@bindThis
	public async updateSystemWebhook(
		params: {
			id: MiSystemWebhook['id'];
			isActive: MiSystemWebhook['isActive'];
			name: MiSystemWebhook['name'];
			on: MiSystemWebhook['on'];
			url: MiSystemWebhook['url'];
			secret: MiSystemWebhook['secret'];
		},
		updater: MiUser,
	): Promise<MiSystemWebhook> {
		const beforeEntity = await this.systemWebhooksRepository.findOneByOrFail({ id: params.id });
		await this.systemWebhooksRepository.update(beforeEntity.id, {
			updatedAt: this.timeService.date,
			isActive: params.isActive,
			name: params.name,
			on: params.on,
			url: params.url,
			secret: params.secret,
		});

		const afterEntity = await this.systemWebhooksRepository.findOneByOrFail({ id: beforeEntity.id });
		await this.internalEventService.emit('systemWebhookUpdated', { id: afterEntity.id });
		this.moderationLogService
			.log(updater, 'updateSystemWebhook', {
				systemWebhookId: beforeEntity.id,
				before: beforeEntity,
				after: afterEntity,
			});

		return afterEntity;
	}

	/**
	 * SystemWebhook を削除する.
	 */
	@bindThis
	public async deleteSystemWebhook(id: MiSystemWebhook['id'], updater: MiUser) {
		const webhook = await this.systemWebhooksRepository.findOneByOrFail({ id });
		await this.systemWebhooksRepository.delete(id);

		await this.internalEventService.emit('systemWebhookDeleted', { id: webhook.id });
		this.moderationLogService
			.log(updater, 'deleteSystemWebhook', {
				systemWebhookId: webhook.id,
				webhook,
			});
	}

	/**
	 * SystemWebhook をWebhook配送キューに追加する
	 * @see QueueService.systemWebhookDeliver
	 */
	@bindThis
	public async enqueueSystemWebhook<T extends SystemWebhookEventType>(
		type: T,
		content: SystemWebhookPayload<T>,
		opts?: {
			excludes?: MiSystemWebhook['id'][];
		},
	) {
		const webhooks = await this.fetchActiveSystemWebhooks()
			.then(webhooks => {
				return webhooks.filter(webhook => !opts?.excludes?.includes(webhook.id) && webhook.on.includes(type));
			});
		return Promise.all(
			webhooks.map(webhook => {
				return this.queueService.systemWebhookDeliver(webhook, type, content);
			}),
		);
	}

	@bindThis
	private onWebhookEvent(): void {
		this.activeSystemWebhooks.delete();
	}

	@bindThis
	public dispose(): void {
		this.internalEventService.off('systemWebhookCreated', this.onWebhookEvent);
		this.internalEventService.off('systemWebhookUpdated', this.onWebhookEvent);
		this.internalEventService.off('systemWebhookDeleted', this.onWebhookEvent);
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
