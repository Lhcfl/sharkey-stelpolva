/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import https from 'node:https';
import { Inject, Injectable } from '@nestjs/common';
import { summaly } from '@misskey-dev/summaly';
import { SummalyResult } from '@misskey-dev/summaly/built/summary.js';
import * as Redis from 'ioredis';
import { IsNull, Not } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import type Logger from '@/logger.js';
import { query } from '@/misc/prelude/url.js';
import { LoggerService } from '@/core/LoggerService.js';
import { bindThis } from '@/decorators.js';
import { ApiError } from '@/server/api/error.js';
import { MiMeta } from '@/models/Meta.js';
import { RedisKVCache } from '@/misc/cache.js';
import { UtilityService } from '@/core/UtilityService.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import type { NotesRepository } from '@/models/_.js';
import { ApUtilityService } from '@/core/activitypub/ApUtilityService.js';
import { ApRequestService } from '@/core/activitypub/ApRequestService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

export type LocalSummalyResult = SummalyResult & {
	haveNoteLocally?: boolean;
};

// Increment this to invalidate cached previews after a major change.
const cacheFormatVersion = 2;

@Injectable()
export class UrlPreviewService {
	private logger: Logger;
	private previewCache: RedisKVCache<LocalSummalyResult>;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private readonly redisClient: Redis.Redis,

		@Inject(DI.meta)
		private readonly meta: MiMeta,

		@Inject(DI.notesRepository)
		private readonly notesRepository: NotesRepository,

		private httpRequestService: HttpRequestService,
		private loggerService: LoggerService,
		private readonly utilityService: UtilityService,
		private readonly apUtilityService: ApUtilityService,
		private readonly apDbResolverService: ApDbResolverService,
		private readonly apRequestService: ApRequestService,
		private readonly systemAccountService: SystemAccountService,
	) {
		this.logger = this.loggerService.getLogger('url-preview');
		this.previewCache = new RedisKVCache<LocalSummalyResult>(this.redisClient, 'summaly', {
			lifetime: 1000 * 60 * 60 * 24, // 1d
			memoryCacheLifetime: 1000 * 60 * 10, // 10m
			fetcher: () => { throw new Error('the UrlPreview cache should never fetch'); },
			toRedisConverter: (value) => JSON.stringify(value),
			fromRedisConverter: (value) => JSON.parse(value),
		});
	}

	@bindThis
	private wrap(url?: string | null): string | null {
		if (url == null) return null;

		// Don't proxy our own media
		if (this.utilityService.isUriLocal(url)) {
			return url;
		}

		// But proxy everything else!
		const mediaQuery = query({ url, preview: '1' });
		return `${this.config.mediaProxy}/preview.webp?${mediaQuery}`;
	}

	@bindThis
	public async handle(
		request: FastifyRequest<{ Querystring: { url?: string; lang?: string; } }>,
		reply: FastifyReply,
	): Promise<object | undefined> {
		const url = request.query.url;
		if (typeof url !== 'string' || !URL.canParse(url)) {
			reply.code(400);
			return;
		}

		const lang = request.query.lang;
		if (Array.isArray(lang)) {
			reply.code(400);
			return;
		}

		if (!this.meta.urlPreviewEnabled) {
			reply.code(403);
			return {
				error: new ApiError({
					message: 'URL preview is disabled',
					code: 'URL_PREVIEW_DISABLED',
					id: '58b36e13-d2f5-0323-b0c6-76aa9dabefb8',
				}),
			};
		}

		if (this.utilityService.isBlockedHost(this.meta.blockedHosts, new URL(url).host)) {
			reply.code(403);
			return {
				error: new ApiError({
					message: 'URL is blocked',
					code: 'URL_PREVIEW_BLOCKED',
					id: '50294652-857b-4b13-9700-8e5c7a8deae8',
				}),
			};
		}

		const cacheKey = `${url}@${lang}@${cacheFormatVersion}`;
		const cached = await this.previewCache.get(cacheKey);
		if (cached !== undefined) {
			// Cache 1 day (matching redis)
			reply.header('Cache-Control', 'public, max-age=86400');

			if (cached.activityPub) {
				cached.haveNoteLocally = !! await this.apDbResolverService.getNoteFromApId(cached.activityPub);
			}

			return cached;
		}

		try {
			const summary: LocalSummalyResult = this.meta.urlPreviewSummaryProxyUrl
				? await this.fetchSummaryFromProxy(url, this.meta, lang)
				: await this.fetchSummary(url, this.meta, lang);

			this.validateUrls(summary);

			// Repeat check, since redirects are allowed.
			if (this.utilityService.isBlockedHost(this.meta.blockedHosts, new URL(summary.url).host)) {
				reply.code(403);
				return {
					error: new ApiError({
						message: 'URL is blocked',
						code: 'URL_PREVIEW_BLOCKED',
						id: '50294652-857b-4b13-9700-8e5c7a8deae8',
					}),
				};
			}

			this.logger.info(`Got preview of ${url} in ${lang}: ${summary.title}`);

			summary.icon = this.wrap(summary.icon);
			summary.thumbnail = this.wrap(summary.thumbnail);

			// Summaly cannot always detect links to a fedi post, so do some additional tests to try and find missed cases.
			if (!summary.activityPub) {
				await this.inferActivityPubLink(summary);
			}

			if (summary.activityPub) {
				// Avoid duplicate checks in case inferActivityPubLink already set this.
				summary.haveNoteLocally ||= !!await this.apDbResolverService.getNoteFromApId(summary.activityPub);
			}

			// Await this to avoid hammering redis when a bunch of URLs are fetched at once
			await this.previewCache.set(cacheKey, summary);

			// Cache 1 day (matching redis)
			reply.header('Cache-Control', 'public, max-age=86400');

			return summary;
		} catch (err) {
			this.logger.warn(`Failed to get preview of ${url} for ${lang}: ${err}`);

			reply.code(422);
			reply.header('Cache-Control', 'max-age=3600');
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
			followRedirects: true,
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
						const netEaseUrl = new URL(url.toString()); // fuck music163's /#/
						if (netEaseUrl.searchParams.get('id')) {
							const summary = await summaly(`https://music.163.com/song?id=${netEaseUrl.searchParams.get('id')}`, { ...opts, plugins: [] });
							summary.player.url = `https://music.163.com/outchain/player?type=2&id=${netEaseUrl.searchParams.get('id')}&auto=1&height=66`;
							summary.player.width = 330;
							summary.player.height = 86;
							return summary;
						} else {
							return await summaly(url.toString(), { ...opts, plugins: [] });
						}
					},
				},
				{
					test: (url) => /^https?:\/\/[^\/]*?music.163.com\/song\/([\d]+)/.test(url.toString()),
					async summarize(url, opts) {
						const id = url.toString().match(/^https?:\/\/[^\/]*?music.163.com\/song\/([\d]+)/)?.[1];
						if (id) {
							const summary = await summaly(`https://music.163.com/song?id=${id}`, { ...opts, plugins: [] });
							summary.player.url = `https://music.163.com/outchain/player?type=2&id=${id}&auto=1&height=66`;
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
								const netEaseUrl = new URL(location.replaceAll('/#/song', '/m/song')); // fuck music163's /#/
								if (!location || !netEaseUrl.searchParams.get('id')) {
									summaly(url.toString(), { ...opts, plugins: [] }).then(val => resolve(val)).catch(reject); // fallback;
								} else {
									summaly(`https://music.163.com/song?id=${netEaseUrl.searchParams.get('id')}`, opts).then(val => resolve(val)).catch(reject);
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
			followRedirects: true,
			url: url,
			lang: lang ?? 'ja-JP',
			userAgent: meta.urlPreviewUserAgent ?? undefined,
			operationTimeout: meta.urlPreviewTimeout,
			contentLengthLimit: meta.urlPreviewMaximumContentLength,
			contentLengthRequired: meta.urlPreviewRequireContentLength,
		});

		return this.httpRequestService.getJson<LocalSummalyResult>(`${proxy}?${queryStr}`, 'application/json, */*', undefined, true);
	}

	private validateUrls(summary: LocalSummalyResult) {
		const urlScheme = this.utilityService.getUrlScheme(summary.url);
		if (urlScheme !== 'http:' && urlScheme !== 'https:') {
			throw new Error(`unsupported scheme in preview URL: "${urlScheme}"`);
		}

		if (summary.player.url) {
			const playerScheme = this.utilityService.getUrlScheme(summary.player.url);
			if (playerScheme !== 'http:' && playerScheme !== 'https:') {
				this.logger.warn(`Redacting preview for ${summary.url}: player URL has unsupported scheme "${playerScheme}"`);
				summary.player.url = null;
			}
		}

		if (summary.icon) {
			const iconScheme = this.utilityService.getUrlScheme(summary.icon);
			if (iconScheme !== 'http:' && iconScheme !== 'https:') {
				this.logger.warn(`Redacting preview for ${summary.url}: icon URL has unsupported scheme "${iconScheme}"`);
				summary.icon = null;
			}
		}

		if (summary.thumbnail) {
			const thumbnailScheme = this.utilityService.getUrlScheme(summary.thumbnail);
			if (thumbnailScheme !== 'http:' && thumbnailScheme !== 'https:') {
				this.logger.warn(`Redacting preview for ${summary.url}: thumbnail URL has unsupported scheme "${thumbnailScheme}"`);
				summary.thumbnail = null;
			}
		}

		if (summary.activityPub) {
			const activityPubScheme = this.utilityService.getUrlScheme(summary.activityPub);
			if (activityPubScheme !== 'http:' && activityPubScheme !== 'https:') {
				this.logger.warn(`Redacting preview for ${summary.url}: ActivityPub URL has unsupported scheme "${activityPubScheme}"`);
				summary.activityPub = null;
			}
		}
	}

	private async inferActivityPubLink(summary: LocalSummalyResult) {
		// Match canonical URI first.
		// This covers local and remote links.
		const isCanonicalUri = !!await this.apDbResolverService.getNoteFromApId(summary.url);
		if (isCanonicalUri) {
			summary.activityPub = summary.url;
			summary.haveNoteLocally = true;
			return;
		}

		// Try public URL next.
		// This is necessary for Mastodon and other software with a different public URL.
		const urlMatches = await this.notesRepository.find({
			select: {
				uri: true,
			},
			where: {
				url: summary.url,
				uri: Not(IsNull()),
			},
		}) as { uri: string }[];

		// Older versions did not validate URL, so do it now to avoid impersonation.
		const matchByUrl = urlMatches.find(({ uri }) => this.apUtilityService.haveSameAuthority(uri, summary.url));
		if (matchByUrl) {
			summary.activityPub = matchByUrl.uri;
			summary.haveNoteLocally = true;
			return;
		}

		// Finally, attempt a signed GET in case it's a direct link to an instance with authorized fetch.
		const instanceActor = await this.systemAccountService.getInstanceActor();
		const remoteObject = await this.apRequestService.signedGet(summary.url, instanceActor).catch(() => null);
		if (remoteObject && this.apUtilityService.haveSameAuthority(remoteObject.id, summary.url)) {
			summary.activityPub = remoteObject.id;
			return;
		}
	}
}
