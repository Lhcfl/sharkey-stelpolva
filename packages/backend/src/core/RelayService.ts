/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiUser } from '@/models/User.js';
import type { RelaysRepository } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { MemorySingleCache } from '@/misc/cache.js';
import type { MiRelay } from '@/models/Relay.js';
import { QueueService } from '@/core/QueueService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { DI } from '@/di-symbols.js';
import { deepClone } from '@/misc/clone.js';
import { bindThis } from '@/decorators.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { CacheManagementService, ManagedMemorySingleCache } from '@/global/CacheManagementService.js';
import type { IActivity } from '@/core/activitypub/type.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import type { Signed } from '@/core/activitypub/JsonLdService.js';

@Injectable()
export class RelayService {
	private readonly logger: Logger;
	private readonly relaysCache: ManagedMemorySingleCache<MiRelay[]>;

	constructor(
		@Inject(DI.relaysRepository)
		private relaysRepository: RelaysRepository,

		private idService: IdService,
		private queueService: QueueService,
		private systemAccountService: SystemAccountService,
		private apRendererService: ApRendererService,
		private readonly loggerService: LoggerService,

		cacheManagementService: CacheManagementService,
	) {
		this.logger = this.loggerService.getLogger('relay');
		this.relaysCache = cacheManagementService.createMemorySingleCache<MiRelay[]>('relay', 1000 * 60 * 10); // 10m
	}

	@bindThis
	public async addRelay(inbox: string): Promise<MiRelay> {
		const relay = await this.relaysRepository.insertOne({
			id: this.idService.gen(),
			inbox,
			status: 'requesting',
		});

		const relayActor = await this.systemAccountService.fetch('relay');
		const follow = this.apRendererService.renderFollowRelay(relay, relayActor);
		const activity = this.apRendererService.addContext(follow);
		this.queueService.deliver(relayActor, activity, relay.inbox, false);

		return relay;
	}

	@bindThis
	public async removeRelay(inbox: string): Promise<void> {
		const relay = await this.relaysRepository.findOneBy({
			inbox,
		});

		if (relay == null) {
			throw new Error('relay not found');
		}

		const relayActor = await this.systemAccountService.fetch('relay');
		const follow = this.apRendererService.renderFollowRelay(relay, relayActor);
		const undo = this.apRendererService.renderUndo(follow, relayActor);
		const activity = this.apRendererService.addContext(undo);
		this.queueService.deliver(relayActor, activity, relay.inbox, false);

		await this.relaysRepository.delete(relay.id);
	}

	@bindThis
	public async listRelay(): Promise<MiRelay[]> {
		const relays = await this.relaysRepository.find();
		return relays;
	}

	@bindThis
	public async relayAccepted(id: string): Promise<string> {
		const result = await this.relaysRepository.update(id, {
			status: 'accepted',
		});

		return JSON.stringify(result);
	}

	@bindThis
	public async relayRejected(id: string): Promise<string> {
		const result = await this.relaysRepository.update(id, {
			status: 'rejected',
		});

		return JSON.stringify(result);
	}

	@bindThis
	public async deliverToRelays(user: { id: MiUser['id']; host: null; }, activity: any): Promise<void> {
		if (activity == null) return;

		const relays = await this.relaysCache.fetch(() => this.relaysRepository.findBy({
			status: 'accepted',
		}));
		if (relays.length === 0) return;

		const copy = deepClone(activity);
		if (!copy.to) copy.to = ['https://www.w3.org/ns/activitystreams#Public'];

		const signed = await this.signActivity(copy, user);

		for (const relay of relays) {
			this.queueService.deliver(user, signed, relay.inbox, false);
		}
	}

	private async signActivity<T extends IActivity>(activity: T, user: { id: MiUser['id']; host: null; }): Promise<T | Signed<T>> {
		try {
			return await this.apRendererService.attachLdSignature(activity, user);
		} catch (err) {
			this.logger.warn(`Error signing activity ${activity.id}: ${renderInlineError(err)}`);
			return activity;
		}
	}
}
