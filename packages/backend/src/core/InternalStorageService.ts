/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { copyFile, unlink, writeFile, chmod } from 'node:fs/promises';
import * as Path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';

@Injectable()
export class InternalStorageService {
	constructor(
		@Inject(DI.config)
		private config: Config,
	) {
		// No one should erase the working directory *while the server is running*.
		fs.mkdirSync(this.config.mediaDirectory, { recursive: true });
	}

	@bindThis
	public resolvePath(key: string) {
		return Path.resolve(this.config.mediaDirectory, key);
	}

	@bindThis
	public read(key: string) {
		return fs.createReadStream(this.resolvePath(key));
	}

	@bindThis
	public async saveFromPath(key: string, srcPath: string): Promise<string> {
		await copyFile(srcPath, this.resolvePath(key));
		return await this.finalizeSavedFile(key);
	}

	@bindThis
	public async saveFromBuffer(key: string, data: Buffer): Promise<string> {
		await writeFile(this.resolvePath(key), data);
		return await this.finalizeSavedFile(key);
	}

	private async finalizeSavedFile(key: string): Promise<string> {
		if (this.config.filePermissionBits) {
			const path = this.resolvePath(key);
			await chmod(path, this.config.filePermissionBits);
		}
		return `${this.config.url}/files/${key}`;
	}

	@bindThis
	public async del(key: string): Promise<void> {
		await unlink(this.resolvePath(key));
	}
}
