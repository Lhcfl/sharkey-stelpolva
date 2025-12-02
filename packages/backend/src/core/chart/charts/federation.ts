/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { FollowingsRepository, InstancesRepository, MiMeta } from '@/models/_.js';
import { AppLockService } from '@/core/AppLockService.js';
import { TimeService } from '@/global/TimeService.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import Chart from '../core.js';
import { ChartLoggerService } from '../ChartLoggerService.js';
import { name, schema } from './entities/federation.js';
import type { KVs } from '../core.js';

/**
 * フェデレーションに関するチャート
 */
@Injectable()
export default class FederationChart extends Chart<typeof schema> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		private appLockService: AppLockService,
		private chartLoggerService: ChartLoggerService,
		private readonly timeService: TimeService,
	) {
		super(db, (k) => appLockService.getChartInsertLock(k), chartLoggerService.logger, name, schema);
	}

	protected getCurrentDate(): Date {
		return this.timeService.date;
	}

	protected async tickMajor(): Promise<Partial<KVs<typeof schema>>> {
		return {
		};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof schema>>> {
		// TODO optimization: replace these with exists()
		const pubsubSubQuery = this.followingsRepository.createQueryBuilder('f')
			.select('f.followerHost')
			.where('f.followerHost IS NOT NULL');

		const subInstancesQuery = this.followingsRepository.createQueryBuilder('f')
			.select('f.followeeHost')
			.where('f.followeeHost IS NOT NULL');

		const pubInstancesQuery = this.followingsRepository.createQueryBuilder('f')
			.select('f.followerHost')
			.where('f.followerHost IS NOT NULL');

		const [sub, pub, pubsub, subActive, pubActive] = await Promise.all([
			this.followingsRepository.createQueryBuilder('following')
				.select('COUNT(DISTINCT following.followeeHost)')
				.where('following.followeeHost IS NOT NULL')
				.innerJoin('following.followeeInstance', 'followeeInstance')
				.andWhere('followeeInstance.suspensionState = \'none\'')
				.andWhere('followeeInstance.isBlocked = false')
				.getRawOne()
				.then(x => parseInt(x.count, 10)),
			this.followingsRepository.createQueryBuilder('following')
				.select('COUNT(DISTINCT following.followerHost)')
				.where('following.followerHost IS NOT NULL')
				.innerJoin('following.followerInstance', 'followerInstance')
				.andWhere('followerInstance.isBlocked = false')
				.andWhere('followerInstance.suspensionState = \'none\'')
				.getRawOne()
				.then(x => parseInt(x.count, 10)),
			this.followingsRepository.createQueryBuilder('following')
				.select('COUNT(DISTINCT following.followeeHost)')
				.where('following.followeeHost IS NOT NULL')
				.innerJoin('following.followeeInstance', 'followeeInstance')
				.andWhere('followeeInstance.isBlocked = false')
				.andWhere('followeeInstance.suspensionState = \'none\'')
				.andWhere(`following.followeeHost IN (${ pubsubSubQuery.getQuery() })`)
				.setParameters(pubsubSubQuery.getParameters())
				.getRawOne()
				.then(x => parseInt(x.count, 10)),
			this.instancesRepository.createQueryBuilder('instance')
				.select('COUNT(instance.id)')
				.where(`instance.host IN (${ subInstancesQuery.getQuery() })`)
				.andWhere('instance.isBlocked = false')
				.andWhere('instance.suspensionState = \'none\'')
				.andWhere('instance.isNotResponding = false')
				.getRawOne()
				.then(x => parseInt(x.count, 10)),
			this.instancesRepository.createQueryBuilder('instance')
				.select('COUNT(instance.id)')
				.where(`instance.host IN (${ pubInstancesQuery.getQuery() })`)
				.andWhere('instance.isBlocked = false')
				.andWhere('instance.suspensionState = \'none\'')
				.andWhere('instance.isNotResponding = false')
				.getRawOne()
				.then(x => parseInt(x.count, 10)),
		]);

		return {
			'sub': sub,
			'pub': pub,
			'pubsub': pubsub,
			'subActive': subActive,
			'pubActive': pubActive,
		};
	}

	@bindThis
	public deliverd(host: string, succeeded: boolean): void {
		this.commit(succeeded ? {
			'deliveredInstances': [host],
		} : {
			'stalled': [host],
		});
	}

	@bindThis
	public inbox(host: string): void {
		this.commit({
			'inboxInstances': [host],
		});
	}
}
