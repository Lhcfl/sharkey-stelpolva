/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as stream from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import * as fileType from 'file-type';
import FFmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import { sharpBmp } from '@misskey-dev/sharp-read-bmp';
import * as blurhash from 'blurhash';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { isSvgFile } from '@/misc/is-svg-file.js';
import { renderInlineError } from '@/misc/render-inline-error.js';

export type FileInfo = {
	size: number;
	md5: string;
	type: {
		mime: string;
		ext: string | null;
	};
	width?: number;
	height?: number;
	orientation?: number;
	blurhash?: string;
	sensitive: boolean;
	porn: boolean;
	warnings: FileInfoWarning[];
};

const TYPE_OCTET_STREAM = {
	mime: 'application/octet-stream',
	ext: null,
};

const TYPE_SVG = {
	mime: 'image/svg+xml',
	ext: 'svg',
};

export const ImageDimensionsExceedLimit = 'image dimensions exceeds limits';
export const ImageDimensionsUnknown = 'cannot detect image dimensions';
export const BlurHashFailed = 'blurhash failed';

export type FileInfoWarningType =
	typeof ImageDimensionsExceedLimit |
	typeof ImageDimensionsUnknown |
	typeof BlurHashFailed;

export type FileInfoWarning = FileInfoWarningType | [warning: FileInfoWarningType, message?: string, error?: unknown];

const PossibleSvgTypes: string[] = [
	// This is what we expect from file-type lib.
	'application/xml',
	// But it could also return these.
	'text/xml',
	'text/html',
	'application/xhtml+xml',
];

@Injectable()
export class FileInfoService {
	private logger: Logger;
	private ffprobeLogger: Logger;

	constructor(
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('file-info');
		this.ffprobeLogger = this.logger.createSubLogger('ffprobe');
	}

	/**
	 * Get file information
	 */
	@bindThis
	public async getFileInfo(path: string): Promise<FileInfo> {
		const warnings: FileInfoWarning[] = [];

		const size = await this.getFileSize(path);
		const md5 = await this.calcHash(path);

		let type = await this.detectType(path);

		// image dimensions
		let width: number | undefined;
		let height: number | undefined;
		let orientation: number | undefined;

		if ([
			'image/png',
			'image/gif',
			'image/jpeg',
			'image/webp',
			'image/avif',
			'image/apng',
			'image/bmp',
			'image/tiff',
			'image/svg+xml',
			'image/vnd.adobe.photoshop',
		].includes(type.mime)) {
			try {
				const imageSize = await this.detectImageSize(path);

				// TODO make this configurable?
				if (imageSize.width <= 16383 && imageSize.height <= 16383) {
					// Save image metadata
					width = imageSize.width;
					height = imageSize.height;
					orientation = imageSize.orientation;
				} else {
					warnings.push([ImageDimensionsExceedLimit, `actual size: ${imageSize.width} x ${imageSize.height}`]);

					// Downgrade oversized images to generic binary data.
					type = TYPE_OCTET_STREAM;
				}
			} catch (e) {
				warnings.push([ImageDimensionsUnknown, `exception in detectImageSize: ${renderInlineError(e)}`, e]);

				// Downgrade unprocessable images to generic binary data.
				type = TYPE_OCTET_STREAM;
			}
		}

		let blurhash: string | undefined;

		if ([
			'image/jpeg',
			'image/gif',
			'image/png',
			'image/apng',
			'image/webp',
			'image/avif',
			'image/svg+xml',
		].includes(type.mime)) {
			blurhash = await this.getBlurhash(path, type.mime).catch(e => {
				warnings.push([BlurHashFailed, `exception in getBlurhash: ${renderInlineError(e)}`, e]);
				return undefined;
			});
		}

		const sensitive = false;
		const porn = false;

		return {
			size,
			md5,
			type,
			width,
			height,
			orientation,
			blurhash,
			sensitive,
			porn,
			warnings,
		};
	}

	@bindThis
	public fixMime(mime: string): string {
		// see https://github.com/misskey-dev/misskey/pull/10686
		if (mime === 'audio/x-flac') {
			return 'audio/flac';
		}
		if (mime === 'audio/vnd.wave') {
			return 'audio/wav';
		}

		return mime;
	}

	/**
	 * ビデオファイルにビデオトラックがあるかどうかチェック
	 * （ない場合：m4a, webmなど）
	 *
	 * @param path ファイルパス
	 * @returns ビデオトラックがあるかどうか（エラー発生時は常に`true`を返す）
	 */
	@bindThis
	private hasVideoTrackOnVideoFile(path: string): Promise<boolean> {
		this.ffprobeLogger.debug(`Checking the video file. File path: ${path}`);
		return new Promise((resolve) => {
			try {
				FFmpeg.ffprobe(path, (err, metadata) => {
					if (err) {
						this.ffprobeLogger.warn(`Could not check the video file. Returns true. File path: ${path}`, err);
						resolve(true);
						return;
					}
					resolve(metadata.streams.some((stream) => stream.codec_type === 'video'));
				});
			} catch (err) {
				this.ffprobeLogger.warn(`Could not check the video file. Returns true. File path: ${path}`, err as Error);
				resolve(true);
			}
		});
	}

	/**
	 * Detect MIME Type and extension
	 */
	@bindThis
	public async detectType(path: string): Promise<{
		mime: string;
		ext: string | null;
	}> {
	// Check 0 byte
		const fileSize = await this.getFileSize(path);
		if (fileSize === 0) {
			return TYPE_OCTET_STREAM;
		}

		const type = await fileType.fileTypeFromFile(path);

		if (type) {
			// XML formats require additional checks
			if (PossibleSvgTypes.includes(type.mime)) {
				if (await this.checkSvg(path)) {
					return TYPE_SVG;
				}

				return {
					mime: type.mime,
					ext: type.ext,
				};
			}

			if ((type.mime.startsWith('video') || type.mime === 'application/ogg') && !(await this.hasVideoTrackOnVideoFile(path))) {
				const newMime = `audio/${type.mime.split('/')[1]}`;
				if (newMime === 'audio/mp4') {
					return {
						mime: 'audio/mp4',
						ext: 'm4a',
					};
				}
				return {
					mime: newMime,
					ext: type.ext,
				};
			}

			return {
				mime: this.fixMime(type.mime),
				ext: type.ext,
			};
		}

		// 種類が不明でもSVGかもしれない
		if (await this.checkSvg(path)) {
			return TYPE_SVG;
		}

		// それでも種類が不明なら application/octet-stream にする
		return TYPE_OCTET_STREAM;
	}

	/**
	 * Check the file is SVG or not
	 */
	@bindThis
	public async checkSvg(path: string): Promise<boolean> {
		try {
			return isSvgFile(path);
		} catch {
			return false;
		}
	}

	/**
	 * Get file size
	 */
	@bindThis
	public async getFileSize(path: string): Promise<number> {
		return (await fs.promises.stat(path)).size;
	}

	/**
	 * Calculate MD5 hash
	 */
	@bindThis
	private async calcHash(path: string): Promise<string> {
		const hash = crypto.createHash('md5').setEncoding('hex');
		await stream.pipeline(fs.createReadStream(path), hash);
		return hash.read();
	}

	/**
	 * Detect dimensions of image
	 */
	@bindThis
	private async detectImageSize(path: string): Promise<{
		width: number;
		height: number;
		orientation?: number;
	}> {
		const meta = await sharp(path, {
			// Disable limits since we're only reading metadata.
			// This should be safe, according to docs: "Fast access to (uncached) image metadata without decoding any compressed pixel data."
			// We could alternately just capture errors, but Sharp errors are untyped so we'd have to unreliably match message strings.
			limitInputPixels: false,
		}).metadata();

		return {
			width: meta.width,
			height: meta.height,
			orientation: meta.orientation,
		};
	}

	/**
	 * Calculate blurhash string of image
	 */
	@bindThis
	private getBlurhash(path: string, type: string): Promise<string> {
		return new Promise(async (resolve, reject) => {
			(await sharpBmp(path, type))
				.raw()
				.ensureAlpha()
				.resize(64, 64, { fit: 'inside' })
				.toBuffer((err, buffer, info) => {
					if (err) return reject(err);

					let hash;

					try {
						hash = blurhash.encode(new Uint8ClampedArray(buffer), info.width, info.height, 5, 5);
					} catch (e) {
						return reject(e);
					}

					resolve(hash);
				});
		});
	}
}
