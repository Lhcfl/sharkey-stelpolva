/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull, Not } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { InstancesRepository, MetasRepository } from '@/models/_.js';
import type { MiMeta } from '@/models/Meta.js';
import type { MiInstance } from '@/models/Instance.js';
import { diffArrays } from '@/misc/diff-arrays.js';
import { bindThis } from '@/decorators.js';
import { FeaturedService } from '@/core/FeaturedService.js';
import { InternalEventService } from '@/global/InternalEventService.js';

@Injectable()
export class MetaService {
	constructor(
		@Inject(DI.metasRepository)
		private readonly metasRepository: MetasRepository,

		@Inject(DI.instancesRepository)
		private readonly instancesRepository: InstancesRepository,

		@Inject(DI.meta)
		private readonly meta: MiMeta,

		private readonly featuredService: FeaturedService,
		private readonly internalEventService: InternalEventService,
	) {}

	@bindThis
	public async update(data: Partial<MiMeta>): Promise<MiMeta> {
		const before = Object.assign({}, this.meta);
		await this.metasRepository.update({ id: before.id }, data);
		const after = await this.metasRepository.findOneOrFail({ where: { id: Not(IsNull()) }, order: { id: 'DESC' } });

		// Propagate changes to blockedHosts, silencedHosts, mediaSilencedHosts, federationInstances, and bubbleInstances to the relevant instance rows.
		await this.persistBlocks(before, after);

		// Propagate changes to hiddenTags
		await this.persistTags(before, after);

		// Propagate changes to other instances.
		// (do this last to make sure listeners get the results of persistBlocks / persistTags)
		await this.internalEventService.emit('metaUpdated', { before, after });

		return after;
	}

	@bindThis
	private async persistBlocks(before: Partial<MiMeta>, after: Partial<MiMeta>): Promise<void> {
		await this.persistBlock(before.blockedHosts, after.blockedHosts, 'isBlocked');
		await this.persistBlock(before.silencedHosts, after.silencedHosts, 'isSilenced');
		await this.persistBlock(before.mediaSilencedHosts, after.mediaSilencedHosts, 'isMediaSilenced');
		await this.persistBlock(before.federationHosts, after.federationHosts, 'isAllowListed');
		await this.persistBlock(before.bubbleInstances, after.bubbleInstances, 'isBubbled');
	}

	@bindThis
	private async persistBlock(before: string[] | undefined, after: string[] | undefined, field: keyof MiInstance): Promise<void> {
		const { added, removed } = diffArrays(before, after);

		if (removed.length > 0) {
			await this.updateInstancesByHost(field, false, removed);
		}

		if (added.length > 0) {
			await this.updateInstancesByHost(field, true, added);
		}
	}

	@bindThis
	private async updateInstancesByHost(field: keyof MiInstance, value: boolean, hosts: string[]): Promise<void> {
		const patterns = hosts.map(host => genHostPattern(host));

		// Use non-array queries when possible, as they are indexed and can be much faster.
		if (patterns.length === 1) {
			await this.instancesRepository
				.createQueryBuilder('instance')
				.update()
				.set({ [field]: value })
				.where('(lower(reverse("host")) || \'.\') LIKE :pattern', { pattern: patterns[0] })
				.execute();
		} else if (patterns.length > 1) {
			await this.instancesRepository
				.createQueryBuilder('instance')
				.update()
				.set({ [field]: value })
				.where('(lower(reverse("host")) || \'.\') LIKE ANY (:patterns)', { patterns })
				.execute();
		}
	}

	@bindThis
	private async persistTags(before: Partial<MiMeta>, after: Partial<MiMeta>): Promise<void> {
		const { added } = diffArrays(before.hiddenTags, after.hiddenTags);
		await this.featuredService.removeHashtagsFromRanking(added);
	}
}

function genHostPattern(host: string): string {
	return host.toLowerCase().split('').reverse().join('') + '.%';
}
