/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { format as dateFormat } from 'date-fns';
import mime from 'mime-types';
import archiver from 'archiver';
import { DI } from '@/di-symbols.js';
import type { EmojisRepository, UsersRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import { createTemp, createTempDir } from '@/misc/create-temp.js';
import { DownloadService } from '@/core/DownloadService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { TimeService } from '@/global/TimeService.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';

@Injectable()
export class ExportCustomEmojisProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,

		private driveService: DriveService,
		private downloadService: DownloadService,
		private queueLoggerService: QueueLoggerService,
		private notificationService: NotificationService,
		private readonly timeService: TimeService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('export-custom-emojis');
	}

	@bindThis
	public async process(job: Bull.Job): Promise<void> {
		const user = await this.usersRepository.findOneBy({ id: job.data.user.id });
		if (user == null) {
			this.logger.debug(`Skip: user ${job.data.user.id} does not exist`);
			return;
		}

		this.logger.info(`Exporting custom emojis of ${job.data.user.id} ...`);

		const [path, cleanup] = await createTempDir();

		this.logger.debug(`Temp dir is ${path}`);

		const metaPath = path + '/meta.json';

		fs.writeFileSync(metaPath, '', 'utf-8');

		const metaStream = fs.createWriteStream(metaPath, { flags: 'a' });

		const writeMeta = (text: string): Promise<void> => {
			return new Promise<void>((res, rej) => {
				metaStream.write(text, err => {
					if (err) {
						this.logger.error('Error exporting custom emojis:', err);
						rej(err);
					} else {
						res();
					}
				});
			});
		};

		await writeMeta(`{"metaVersion":2,"host":"${this.config.host}","exportedAt":"${this.timeService.date.toString()}","emojis":[`);

		const customEmojis = await this.emojisRepository.find({
			where: {
				host: IsNull(),
			},
			order: {
				id: 'ASC',
			},
		});

		for (const emoji of customEmojis) {
			if (!/^[\p{Letter}\p{Number}\p{Mark}_+-]+$/u.test(emoji.name)) {
				this.logger.error(`invalid emoji name: ${emoji.name}`);
				continue;
			}
			const ext = mime.extension(emoji.type ?? 'image/png');
			const fileName = emoji.name + (ext ? '.' + ext : '');
			const emojiPath = path + '/' + fileName;
			fs.writeFileSync(emojiPath, '', 'binary');
			let downloaded = false;

			try {
				await this.downloadService.downloadUrl(emoji.originalUrl, emojiPath);
				downloaded = true;
			} catch (e) { // TODO: 何度か再試行
				this.logger.error('Error exporting custom emojis:', e as Error);
			}

			if (!downloaded) {
				fs.unlinkSync(emojiPath);
			}

			const content = JSON.stringify({
				fileName: fileName,
				downloaded: downloaded,
				emoji: emoji,
			});
			const isFirst = customEmojis.indexOf(emoji) === 0;

			await writeMeta(isFirst ? content : ',\n' + content);
		}

		await writeMeta(']}');

		metaStream.end();

		// Create archive
		await new Promise<void>(async (resolve) => {
			const [archivePath, archiveCleanup] = await createTemp();
			const archiveStream = fs.createWriteStream(archivePath);
			const archive = archiver('zip', {
				zlib: { level: 0 },
			});
			archiveStream.on('close', async () => {
				this.logger.debug(`Exported to: ${archivePath}`);

				const fileName = 'custom-emojis-' + dateFormat(this.timeService.date, 'yyyy-MM-dd-HH-mm-ss') + '.zip';
				const driveFile = await this.driveService.addFile({ user, path: archivePath, name: fileName, force: true });

				this.logger.debug(`Exported to: ${driveFile.id}`);

				this.notificationService.createNotification(user.id, 'exportCompleted', {
					exportedEntity: 'customEmoji',
					fileId: driveFile.id,
				});

				cleanup();
				archiveCleanup();
				resolve();
			});
			archive.pipe(archiveStream);
			archive.directory(path, false);
			archive.finalize();
		});
	}
}
