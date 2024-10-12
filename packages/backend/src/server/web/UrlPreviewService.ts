/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import https from 'node:https';
import { Inject, Injectable } from '@nestjs/common';
import { summaly } from '@misskey-dev/summaly';
import { SummalyResult } from '@misskey-dev/summaly/built/summary.js';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { MetaService } from '@/core/MetaService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import type Logger from '@/logger.js';
import { query } from '@/misc/prelude/url.js';
import { LoggerService } from '@/core/LoggerService.js';
import { bindThis } from '@/decorators.js';
import { ApiError } from '@/server/api/error.js';
import { MiMeta } from '@/models/Meta.js';
import { RedisKVCache } from '@/misc/cache.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

@Injectable()
export class UrlPreviewService {
	private logger: Logger;
	private previewCache: RedisKVCache<SummalyResult>;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private metaService: MetaService,
		private httpRequestService: HttpRequestService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('url-preview');
		this.previewCache = new RedisKVCache<SummalyResult>(this.redisClient, 'summaly', {
			lifetime: 1000 * 60 * 60 * 24, // 1d
			memoryCacheLifetime: 1000 * 60 * 10, // 10m
			fetcher: (key: string) => { throw new Error('the UrlPreview cache should never fetch'); },
			toRedisConverter: (value) => JSON.stringify(value),
			fromRedisConverter: (value) => JSON.parse(value),
		});
	}

	@bindThis
	private wrap(url?: string | null): string | null {
		return url != null
			? url.match(/^https?:\/\//)
				? `${this.config.mediaProxy}/preview.webp?${query({
					url,
					preview: '1',
				})}`
				: url
			: null;
	}

	@bindThis
	public async handle(
		request: FastifyRequest<{ Querystring: { url: string; lang?: string; } }>,
		reply: FastifyReply,
	): Promise<object | undefined> {
		const url = request.query.url;
		if (typeof url !== 'string') {
			reply.code(400);
			return;
		}

		const lang = request.query.lang;
		if (Array.isArray(lang)) {
			reply.code(400);
			return;
		}

		const meta = await this.metaService.fetch();

		if (!meta.urlPreviewEnabled) {
			reply.code(403);
			return {
				error: new ApiError({
					message: 'URL preview is disabled',
					code: 'URL_PREVIEW_DISABLED',
					id: '58b36e13-d2f5-0323-b0c6-76aa9dabefb8',
				}),
			};
		}

		const key = `${url}@${lang}`;
		const cached = await this.previewCache.get(key);
		if (cached !== undefined) {
			this.logger.info(`Returning cache preview of ${key}`);
			// Cache 7days
			reply.header('Cache-Control', 'max-age=604800, immutable');

			return cached;
		}

		this.logger.info(meta.urlPreviewSummaryProxyUrl
			? `(Proxy) Getting preview of ${key} ...`
			: `Getting preview of ${key} ...`);

		try {
			const summary = meta.urlPreviewSummaryProxyUrl
				? await this.fetchSummaryFromProxy(url, meta, lang)
				: await this.fetchSummary(url, meta, lang);

			this.logger.succ(`Got preview of ${url}: ${summary.title}`);

			if (!(summary.url.startsWith('http://') || summary.url.startsWith('https://'))) {
				throw new Error('unsupported schema included');
			}

			if (summary.player.url && !(summary.player.url.startsWith('http://') || summary.player.url.startsWith('https://'))) {
				throw new Error('unsupported schema included');
			}

			summary.icon = this.wrap(summary.icon);
			summary.thumbnail = this.wrap(summary.thumbnail);

			this.previewCache.set(key, summary);

			// Cache 7days
			reply.header('Cache-Control', 'max-age=604800, immutable');

			return summary;
		} catch (err) {
			this.logger.warn(`Failed to get preview of ${url}: ${err}`);

			reply.code(422);
			reply.header('Cache-Control', 'max-age=86400, immutable');
			return {
				error: new ApiError({
					message: 'Failed to get preview',
					code: 'URL_PREVIEW_FAILED',
					id: '09d01cb5-53b9-4856-82e5-38a50c290a3b',
				}),
			};
		}
	}

	private fetchSummary(url: string, meta: MiMeta, lang?: string): Promise<SummalyResult> {
		const agent = this.config.proxy
			? {
				http: this.httpRequestService.httpAgent,
				https: this.httpRequestService.httpsAgent,
			}
			: undefined;

		return summaly(url, {
			followRedirects: false,
			lang: lang ?? 'ja-JP',
			agent: agent,
			userAgent: meta.urlPreviewUserAgent ?? undefined,
			operationTimeout: meta.urlPreviewTimeout,
			contentLengthLimit: meta.urlPreviewMaximumContentLength,
			contentLengthRequired: meta.urlPreviewRequireContentLength,
			plugins: [
				{
					test: (url) => /^https:\/\/(www.)?bilibili.com\/video\/([a-zA-Z0-9]+)/.test(url.toString()),
					async summarize(url, opts) {
						const summary = await summaly(url.toString(), { ...opts, plugins: [] });
						const bilibiliMatch = summary.url.match(/^https:\/\/[^/]*?bilibili.com\/video\/([a-zA-Z0-9]+)/);
						if (bilibiliMatch?.[1] && summary.player.url == null) {
							summary.player.url = `https://player.bilibili.com/player.html?isOutside=true&bvid=${bilibiliMatch[1]}`;
							summary.player.width = 640;
							summary.player.height = 480;
						}
						return summary;
					},
				},
				{
					test: (url) => /^https:\/\/b23.tv\/([a-zA-Z0-9]+)/.test(url.toString()),
					summarize(url, opts) {
						return new Promise((resolve, reject) => {
							https.request({
								hostname: 'b23.tv',
								path: url.pathname,
								method: 'GET',
								headers: {
									'User-Agent': 'Mozilla/5.0 (compatible)',
								},
							}, (res) => {
								const location = res.headers['location'] ?? '';
								const bilibiliMatch = location.match(/^https:\/\/www.bilibili.com\/video\/([a-zA-Z0-9]+)/);
								if (!location || !bilibiliMatch?.[1]) {
									summaly(url.toString(), { ...opts, plugins: [] }).then(val => resolve(val)).catch(reject); // fallback;
								} else {
									summaly(`https://www.bilibili.com/video/${bilibiliMatch[1]}`, opts).then(val => resolve(val)).catch(reject);
								}
							}).end();
						});
					},
				},
				{
					test: (url) => /^https?:\/\/[^\/]*?music.163.com\/[\s\S]*?song\?[\s\S]*id=([\d]+)/.test(url.toString()),
					async summarize(url, opts) {
						const music163Match = url.toString().match(/^https?:\/\/[^\/]*?music.163.com\/[\s\S]*?song\?[\s\S]*?id=([\d]+)/);
						if (music163Match?.[1]) {
							const summary = await summaly(`https://music.163.com/song?id=${music163Match[1]}`, { ...opts, plugins: [] });
							summary.player.url = `https://music.163.com/outchain/player?type=2&id=${music163Match[1]}&auto=1&height=66`;
							summary.player.width = 330;
							summary.player.height = 86;
							return summary;
						} else {
							return await summaly(url.toString(), { ...opts, plugins: [] });
						}
					},
				},
				{
					test: (url) => /^https?:\/\/163cn.tv\//.test(url.toString()),
					summarize(url, opts) {
						return new Promise((resolve, reject) => {
							https.request({
								hostname: '163cn.tv',
								path: url.pathname,
								method: 'GET',
								headers: {
									'User-Agent': 'Mozilla/5.0 (compatible)',
								},
							}, (res) => {
								const location = res.headers['location'] ?? '';
								const music163Match = location.match(/^https?:\/\/[^\/]*?music.163.com\/[\s\S]*?song\?[\s\S]*?id=([\d]+)/);
								if (!location || !music163Match?.[1]) {
									summaly(url.toString(), { ...opts, plugins: [] }).then(val => resolve(val)).catch(reject); // fallback;
								} else {
									summaly(`https://music.163.com/song?id=${music163Match[1]}`, opts).then(val => resolve(val)).catch(reject);
								}
							}).end();
						});
					},
				},
			],
		});
	}

	private fetchSummaryFromProxy(url: string, meta: MiMeta, lang?: string): Promise<SummalyResult> {
		const proxy = meta.urlPreviewSummaryProxyUrl!;
		const queryStr = query({
			url: url,
			lang: lang ?? 'ja-JP',
			userAgent: meta.urlPreviewUserAgent ?? undefined,
			operationTimeout: meta.urlPreviewTimeout,
			contentLengthLimit: meta.urlPreviewMaximumContentLength,
			contentLengthRequired: meta.urlPreviewRequireContentLength,
		});

		return this.httpRequestService.getJson<SummalyResult>(`${proxy}?${queryStr}`);
	}
}
