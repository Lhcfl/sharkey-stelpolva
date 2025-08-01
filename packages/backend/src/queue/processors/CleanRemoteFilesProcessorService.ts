/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull, MoreThan, Not, Brackets } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { MiDriveFile, DriveFilesRepository } from '@/models/_.js';
import { MiUser } from '@/models/_.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { CleanRemoteFilesJobData } from '../types.js';
import { IdService } from '@/core/IdService.js';

@Injectable()
export class CleanRemoteFilesProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private driveService: DriveService,
		private queueLoggerService: QueueLoggerService,
		private idService: IdService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('clean-remote-files');
	}

	@bindThis
	public async process(job: Bull.Job<CleanRemoteFilesJobData>): Promise<void> {
		this.logger.info('Deleting cached remote files...');

		const olderThanTimestamp = Date.now() - (job.data.olderThanSeconds ?? 0) * 1000;
		const olderThanDate = new Date(olderThanTimestamp);
		const keepFilesInUse = job.data.keepFilesInUse ?? false;
		let deletedCount = 0;
		let cursor: MiDriveFile['id'] | null = null;
		let errorCount = 0;

		const filesQuery = this.driveFilesRepository.createQueryBuilder('file')
			.where('file.userHost IS NOT NULL') // remote files
			.andWhere('file.isLink = FALSE') // cached
			.andWhere('file.id <= :id', { id: this.idService.gen(olderThanTimestamp) }) // and old
			.orderBy('file.id', 'ASC');

		if (keepFilesInUse) {
			filesQuery
			// are they used as avatar&&c?
				.leftJoinAndSelect(
					MiUser, 'fileuser',
					'fileuser."avatarId"="file"."id" OR fileuser."bannerId"="file"."id" OR fileuser."backgroundId"="file"."id"'
				)
				.andWhere(
					new Brackets((qb) => {
						qb.where('fileuser.id IS NULL') // not used
							.orWhere( // or attached to a user
								new Brackets((qb) => {
									qb.where('fileuser.lastFetchedAt IS NOT NULL') // weird? maybe this only applies to local users
										.andWhere('fileuser.lastFetchedAt < :old', { old: olderThanDate }); // old user
								})
							);
					})
				);
		}

		const total = await filesQuery.clone().getCount();

		while (true) {
			const thisBatchQuery = filesQuery.clone();
			if (cursor) thisBatchQuery.andWhere('file.id > :cursor', { cursor });
			const files = await thisBatchQuery.take(256).getMany();

			if (files.length === 0) {
				job.updateProgress(100);
				break;
			}

			cursor = files.at(-1)?.id ?? null;

			// Handle deletion in a batch
			const results = await Promise.allSettled(files.map(file => this.driveService.deleteFileSync(file, true)));

			results.forEach((result, index) => {
				if (result.status === 'fulfilled') {
					deletedCount++;
				} else {
					this.logger.error(`Failed to delete file ID ${files[index].id}: ${result.reason}`);
					errorCount++;
				}
			});

			await job.updateProgress(100 / total * deletedCount);
		}

		this.logger.info(`All cached remote files processed. Total deleted: ${deletedCount}, Failed: ${errorCount}.`);
	}
}
