/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { copyFile, mkdir, unlink, writeFile } from 'node:fs/promises';
import * as Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

const path = Path.resolve(_dirname, '../../../../files');

@Injectable()
export class InternalStorageService {
	constructor(
		@Inject(DI.config)
		private config: Config,
	) {
	}

	@bindThis
	public resolvePath(key: string) {
		return Path.resolve(path, key);
	}

	@bindThis
	public read(key: string) {
		return fs.createReadStream(this.resolvePath(key));
	}

	@bindThis
	public async saveFromPath(key: string, srcPath: string): Promise<string> {
		await mkdir(path, { recursive: true });
		await copyFile(srcPath, this.resolvePath(key));
		return `${this.config.url}/files/${key}`;
	}

	@bindThis
	public async saveFromBuffer(key: string, data: Buffer): Promise<string> {
		await mkdir(path, { recursive: true });
		await writeFile(this.resolvePath(key), data);
		return `${this.config.url}/files/${key}`;
	}

	@bindThis
	public async del(key: string): Promise<void> {
		await unlink(this.resolvePath(key));
	}
}
