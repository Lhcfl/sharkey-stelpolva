/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { MiUser, type WebhooksRepository } from '@/models/_.js';
import { MiWebhook, WebhookEventTypes } from '@/models/Webhook.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { InternalEventTypes } from '@/core/GlobalEventService.js';
import type { Packed } from '@/misc/json-schema.js';
import { QueueService } from '@/core/QueueService.js';
import { CacheManagementService, type ManagedMemorySingleCache } from '@/global/CacheManagementService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import type { OnApplicationShutdown } from '@nestjs/common';

export type UserWebhookPayload<T extends WebhookEventTypes> =
	T extends 'note' | 'reply' | 'renote' | 'mention' | 'edited' ? {
		note: Packed<'Note'>,
	} :
	T extends 'follow' | 'unfollow' ? {
		user: Packed<'UserDetailedNotMe'>,
	} :
	T extends 'followed' ? {
		user: Packed<'UserLite'>,
	} : never;

@Injectable()
export class UserWebhookService implements OnApplicationShutdown {
	private readonly activeWebhooks: ManagedMemorySingleCache<MiWebhook[]>;

	constructor(
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,
		@Inject(DI.webhooksRepository)
		private webhooksRepository: WebhooksRepository,
		private queueService: QueueService,
		private readonly internalEventService: InternalEventService,

		cacheManagementService: CacheManagementService,
	) {
		this.activeWebhooks = cacheManagementService.createMemorySingleCache<MiWebhook[]>('userWebhooks', 1000 * 60 * 60 * 12); // 12h

		this.internalEventService.on('webhookCreated', this.onWebhookEvent);
		this.internalEventService.on('webhookUpdated', this.onWebhookEvent);
		this.internalEventService.on('webhookDeleted', this.onWebhookEvent);
	}

	@bindThis
	public async getActiveWebhooks() {
		return await this.activeWebhooks.fetch(async () => {
			return await this.webhooksRepository.findBy({
				active: true,
			});
		});
	}

	/**
	 * UserWebhook の一覧を取得する.
	 */
	@bindThis
	public fetchWebhooks(params?: {
		ids?: MiWebhook['id'][];
		isActive?: MiWebhook['active'];
		on?: MiWebhook['on'];
	}): Promise<MiWebhook[]> {
		const query = this.webhooksRepository.createQueryBuilder('webhook');
		if (params) {
			if (params.ids && params.ids.length > 0) {
				query.andWhere('webhook.id IN (:...ids)', { ids: params.ids });
			}
			if (params.isActive !== undefined) {
				query.andWhere('webhook.active = :isActive', { isActive: params.isActive });
			}
			if (params.on && params.on.length > 0) {
				query.andWhere(':on <@ webhook.on', { on: params.on });
			}
		}

		return query.getMany();
	}

	/**
	 * UserWebhook をWebhook配送キューに追加する
	 * @see QueueService.userWebhookDeliver
	 */
	@bindThis
	public async enqueueUserWebhook<T extends WebhookEventTypes>(
		userId: MiUser['id'],
		type: T,
		content: UserWebhookPayload<T>,
	) {
		const webhooks = await this.getActiveWebhooks()
			.then(webhooks => webhooks.filter(webhook => webhook.userId === userId && webhook.on.includes(type)));
		return await Promise.all(
			webhooks.map(webhook => {
				return this.queueService.userWebhookDeliver(webhook, type, content);
			}),
		);
	}

	@bindThis
	private async onWebhookEvent<E extends 'webhookCreated' | 'webhookUpdated' | 'webhookDeleted'>(body: InternalEventTypes[E], type: E): Promise<void> {
		const cache = this.activeWebhooks.get();
		if (!cache) {
			return;
		}

		switch (type) {
			case 'webhookCreated': {
				// Add
				const webhook = await this.webhooksRepository.findOneBy({ id: body.id });
				if (webhook) {
					cache.push(webhook);
				}
				break;
			}
			case 'webhookUpdated': {
				// Delete
				const index = cache.findIndex(webhook => webhook.id === body.id);
				if (index > -1) {
					cache.splice(index, 1);
				}

				// Add
				const webhook = await this.webhooksRepository.findOneBy({ id: body.id });
				if (webhook) {
					cache.push(webhook);
				}
				break;
			}
			case 'webhookDeleted': {
				// Delete
				const index = cache.findIndex(webhook => webhook.id === body.id);
				if (index > -1) {
					cache.splice(index, 1);
				}
				break;
			}
		}
	}

	@bindThis
	public dispose(): void {
		this.internalEventService.off('webhookCreated', this.onWebhookEvent);
		this.internalEventService.off('webhookUpdated', this.onWebhookEvent);
		this.internalEventService.off('webhookDeleted', this.onWebhookEvent);
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
