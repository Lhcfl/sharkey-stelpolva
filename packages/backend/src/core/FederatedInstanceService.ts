/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { In } from 'typeorm';
import type { InstancesRepository } from '@/models/_.js';
import type { MiMeta } from '@/models/Meta.js';
import type { MiInstance } from '@/models/Instance.js';
import type { InternalEventTypes } from '@/core/GlobalEventService.js';
import { IdService } from '@/core/IdService.js';
import { DI } from '@/di-symbols.js';
import { UtilityService } from '@/core/UtilityService.js';
import { CacheManagementService, type ManagedQuantumKVCache } from '@/global/CacheManagementService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { diffArraysSimple } from '@/misc/diff-arrays.js';
import { bindThis } from '@/decorators.js';
import { TimeService } from '@/global/TimeService.js';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';

@Injectable()
export class FederatedInstanceService implements OnApplicationShutdown {
	public readonly federatedInstanceCache: ManagedQuantumKVCache<MiInstance>;

	constructor(
		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		@Inject(DI.meta)
		private readonly meta: MiMeta,

		private utilityService: UtilityService,
		private idService: IdService,
		private readonly internalEventService: InternalEventService,
		private readonly timeService: TimeService,

		cacheManagementService: CacheManagementService,
	) {
		this.federatedInstanceCache = cacheManagementService.createQuantumKVCache('federatedInstance', {
			// TODO can we increase this?
			lifetime: 1000 * 60 * 3, // 3 minutes
			fetcher: async key => {
				const host = this.utilityService.toPuny(key);
				let instance = await this.instancesRepository.findOneBy({ host });
				if (instance == null) {
					await this.instancesRepository.createQueryBuilder('instance')
						.insert()
						.values({
							id: this.idService.gen(),
							host,
							firstRetrievedAt: this.timeService.date,
							isBlocked: this.utilityService.isBlockedHost(host),
							isSilenced: this.utilityService.isSilencedHost(host),
							isMediaSilenced: this.utilityService.isMediaSilencedHost(host),
							isAllowListed: this.utilityService.isAllowListedHost(host),
							isBubbled: this.utilityService.isBubbledHost(host),
						})
						.orIgnore()
						.execute();

					instance = await this.instancesRepository.findOneByOrFail({ host });
				}
				return instance;
			},
			// optionalFetcher not needed
			bulkFetcher: async keys => {
				const hosts = keys.map(key => this.utilityService.toPuny(key));
				const instances = await this.instancesRepository.findBy({ host: In(hosts) });
				return instances.map(instance => [instance.host, instance]);
			},
		});

		this.internalEventService.on('metaUpdated', this.onMetaUpdated, { ignoreRemote: true });
	}

	@bindThis
	public async fetchOrRegister(host: string): Promise<MiInstance> {
		return this.federatedInstanceCache.fetch(host);
		/*
		host = this.utilityService.toPuny(host);

		const cached = this.federatedInstanceCache.get(host);
		if (cached) return cached;

		let index = await this.instancesRepository.findOneBy({ host });
		if (index == null) {
			await this.instancesRepository.createQueryBuilder('instance')
				.insert()
				.values({
					id: this.idService.gen(),
					host,
					firstRetrievedAt: this.timeService.date,
					isBlocked: this.utilityService.isBlockedHost(host),
					isSilenced: this.utilityService.isSilencedHost(host),
					isMediaSilenced: this.utilityService.isMediaSilencedHost(host),
					isAllowListed: this.utilityService.isAllowListedHost(host),
					isBubbled: this.utilityService.isBubbledHost(host),
				})
				.orIgnore()
				.execute();

			index = await this.instancesRepository.findOneByOrFail({ host });
		}

		await this.federatedInstanceCache.set(host, index);
		return index;
		 */
	}

	@bindThis
	public async fetch(host: string): Promise<MiInstance> {
		return this.federatedInstanceCache.fetch(host);
		/*
		host = this.utilityService.toPuny(host);

		const cached = this.federatedInstanceCache.get(host);
		if (cached !== undefined) return cached;

		const index = await this.instancesRepository.findOneBy({ host });

		if (index == null) {
			await this.federatedInstanceCache.set(host, null);
			return null;
		} else {
			await this.federatedInstanceCache.set(host, index);
			return index;
		}
		*/
	}

	@bindThis
	public async update(id: MiInstance['id'], data: QueryDeepPartialEntity<MiInstance>): Promise<MiInstance> {
		const result = await this.instancesRepository.createQueryBuilder().update()
			.set(data)
			.where('id = :id', { id })
			.returning('*')
			.execute()
			.then((response) => {
				return response.raw[0] as MiInstance;
			});

		await this.federatedInstanceCache.set(result.host, result);

		return result;
	}

	/**
	 * Gets all instances in the allowlist (meta.federationHosts).
	 */
	@bindThis
	public async getAllowList(): Promise<MiInstance[]> {
		const allowedHosts = new Set(this.meta.federationHosts);
		this.meta.blockedHosts.forEach(h => allowedHosts.delete(h));

		const instances = await this.federatedInstanceCache.fetchMany(this.meta.federationHosts);
		return instances.map(i => i[1]);
	}

	/**
	 * Gets all instances in the denylist (meta.blockedHosts).
	 */
	@bindThis
	public async getDenyList(): Promise<MiInstance[]> {
		const instances = await this.federatedInstanceCache.fetchMany(this.meta.blockedHosts);
		return instances.map(i => i[1]);
	}

	@bindThis
	private async onMetaUpdated(body: InternalEventTypes['metaUpdated']): Promise<void> {
		const { before, after } = body;
		const changed = (
			diffArraysSimple(before?.blockedHosts, after.blockedHosts) ||
			diffArraysSimple(before?.silencedHosts, after.silencedHosts) ||
			diffArraysSimple(before?.mediaSilencedHosts, after.mediaSilencedHosts) ||
			diffArraysSimple(before?.federationHosts, after.federationHosts) ||
			diffArraysSimple(before?.bubbleInstances, after.bubbleInstances)
		);

		if (changed) {
			// We have to clear the whole thing, otherwise subdomains won't be synced.
			// This gets fired in *each* process so don't do anything to trigger cache notifications!
			this.federatedInstanceCache.clear();
		}
	}

	@bindThis
	public dispose() {
		this.internalEventService.off('metaUpdated', this.onMetaUpdated);
	}

	@bindThis
	public onApplicationShutdown() {
		this.dispose();
	}
}
