/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import { ZipReader } from 'slacc';
import { IsNull } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { EmojisRepository, DriveFilesRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { createTempDir } from '@/misc/create-temp.js';
import { DriveService } from '@/core/DriveService.js';
import { DownloadService } from '@/core/DownloadService.js';
import { bindThis } from '@/decorators.js';
import type { Config } from '@/config.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import { NotificationService } from '@/core/NotificationService.js';
import type * as Bull from 'bullmq';
import type { DbUserImportJobData } from '../types.js';

// TODO: 名前衝突時の動作を選べるようにする
@Injectable()
export class ImportCustomEmojisProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,

		private customEmojiService: CustomEmojiService,
		private driveService: DriveService,
		private downloadService: DownloadService,
		private queueLoggerService: QueueLoggerService,
		private notificationService: NotificationService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('import-custom-emojis');
	}

	@bindThis
	public async process(job: Bull.Job<DbUserImportJobData>): Promise<void> {
		const file = await this.driveFilesRepository.findOneBy({
			id: job.data.fileId,
		});
		if (file == null) {
			this.logger.debug(`Skip: file ${job.data.fileId} does not exist`);
			return;
		}

		this.logger.info(`Importing custom emojis from ${file.id} (${file.name}) ...`);

		const [path, cleanup] = await createTempDir();

		this.logger.debug(`Temp dir is ${path}`);

		const destPath = path + '/emojis.zip';

		try {
			fs.writeFileSync(destPath, '', 'binary');
			await this.downloadService.downloadUrl(file.url, destPath, { operationTimeout: this.config.import?.downloadTimeout, maxSize: this.config.import?.maxFileSize });
		} catch (e) { // TODO: 何度か再試行
			this.logger.error(`Error importing custom emojis: ${renderInlineError(e)}`);
			throw e;
		}

		const outputPath = path + '/emojis';
		try {
			this.logger.debug(`Unzipping to ${outputPath}`);
			ZipReader.withDestinationPath(outputPath).viaBuffer(await fs.promises.readFile(destPath));
			const metaRaw = fs.readFileSync(outputPath + '/meta.json', 'utf-8');
			const meta = JSON.parse(metaRaw);

			for (const record of meta.emojis) {
				if (!record.downloaded) continue;
				if (!/^[a-zA-Z0-9_]+?([a-zA-Z0-9\.]+)?$/.test(record.fileName)) {
					this.logger.error(`invalid filename: ${record.fileName}`);
					continue;
				}
				const emojiInfo = record.emoji;
				const nameNfc = emojiInfo.name.normalize('NFC');
				if (!/^[\p{Letter}\p{Number}\p{Mark}_+-]+$/u.test(nameNfc)) {
					this.logger.error(`invalid emojiname: ${nameNfc}`);
					continue;
				}
				const emojiPath = outputPath + '/' + record.fileName;

				const existing = await this.customEmojiService.emojisByIdCache.fetchMaybe(nameNfc);
				if (existing) {
					await this.customEmojiService.delete(existing.id, job.data.user);
				}

				try {
					const driveFile = await this.driveService.addFile({
						user: null,
						path: emojiPath,
						name: record.fileName,
						force: true,
					});
					await this.customEmojiService.add({
						originalUrl: driveFile.url,
						publicUrl: driveFile.webpublicUrl ?? driveFile.url,
						fileType: driveFile.webpublicType ?? driveFile.type,
						name: nameNfc,
						category: emojiInfo.category?.normalize('NFC'),
						host: null,
						aliases: emojiInfo.aliases?.map((a: string) => a.normalize('NFC')),
						license: emojiInfo.license,
						isSensitive: emojiInfo.isSensitive,
						localOnly: emojiInfo.localOnly,
						roleIdsThatCanBeUsedThisEmojiAsReaction: [],
					});
				} catch (e) {
					if (e instanceof Error || typeof e === 'string') {
						this.logger.error(`couldn't import ${emojiPath} for ${emojiInfo.name}: ${renderInlineError(e)}`);
					}
					continue;
				}
			}

			cleanup();

			this.notificationService.createNotification(job.data.user.id, 'importCompleted', {
				importedEntity: 'customEmoji',
				fileId: file.id,
			});

			this.logger.debug('Imported', file.name);
		} catch (e) {
			this.logger.error('Error importing custom emojis:', e as Error);
			cleanup();
			throw e;
		}
	}
}
