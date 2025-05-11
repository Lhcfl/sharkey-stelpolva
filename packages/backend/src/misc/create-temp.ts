/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { pipeline } from 'node:stream/promises';
import fs from 'node:fs';
import * as tmp from 'tmp';

export function createTemp(): Promise<[string, () => void]> {
	return new Promise<[string, () => void]>((res, rej) => {
		tmp.file((e, path, fd, cleanup) => {
			if (e) return rej(e);
			res([path, process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development' ? cleanup : () => {}]);
		});
	});
}

export function createTempDir(): Promise<[string, () => void]> {
	return new Promise<[string, () => void]>((res, rej) => {
		tmp.dir(
			{
				unsafeCleanup: true,
			},
			(e, path, cleanup) => {
				if (e) return rej(e);
				res([path, process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development' ? cleanup : () => {}]);
			},
		);
	});
}

export async function saveToTempFile(stream: NodeJS.ReadableStream & { truncated?: boolean }): Promise<[string, () => void]> {
	const [filepath, cleanup] = await createTemp();

	try {
		await pipeline(stream, fs.createWriteStream(filepath));
	} catch (e) {
		cleanup();
		throw e;
	}

	if (stream.truncated) {
		cleanup();
		throw new Error('Read failed: input stream truncated');
	}

	return [filepath, cleanup];
}
