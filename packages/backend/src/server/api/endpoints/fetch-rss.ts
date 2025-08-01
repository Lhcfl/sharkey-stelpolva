/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { parseFeed } from 'htmlparser2';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { ApiError } from '../error.js';
import type { FeedItem } from 'domutils';

export const meta = {
	tags: ['meta'],

	requireCredential: false,
	allowGet: true,
	cacheSec: 60 * 3,

	errors: {
		fetchFailed: {
			id: '88f4356f-719d-4715-b4fc-703a10a812d2',
			code: 'FETCH_FAILED',
			message: 'Failed to fetch RSS feed',
		},
	},

	res: {
		type: 'object',
		properties: {
			type: {
				type: 'string',
				optional: false,
			},
			id: {
				type: 'string',
				optional: true,
			},
			updated: {
				type: 'string',
				optional: true,
			},
			author: {
				type: 'string',
				optional: true,
			},
			link: {
				type: 'string',
				optional: true,
			},
			title: {
				type: 'string',
				optional: true,
			},
			items: {
				type: 'array',
				optional: false,
				items: {
					type: 'object',
					properties: {
						link: {
							type: 'string',
							optional: true,
						},
						guid: {
							type: 'string',
							optional: true,
						},
						title: {
							type: 'string',
							optional: true,
						},
						pubDate: {
							type: 'string',
							optional: true,
						},
						description: {
							type: 'string',
							optional: true,
						},
						media: {
							type: 'array',
							optional: false,
							items: {
								type: 'object',
								properties: {
									medium: {
										type: 'string',
										optional: true,
									},
									url: {
										type: 'string',
										optional: true,
									},
									type: {
										type: 'string',
										optional: true,
									},
									lang: {
										type: 'string',
										optional: true,
									},
								},
							},
						},
					},
				},
			},
			description: {
				type: 'string',
				optional: true,
			},
		},
	},

	// 20 calls per 10 seconds
	limit: {
		duration: 1000 * 10,
		max: 20,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		url: { type: 'string' },
	},
	required: ['url'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private httpRequestService: HttpRequestService,
	) {
		super(meta, paramDef, async (ps) => {
			const res = await this.httpRequestService.send(ps.url, {
				method: 'GET',
				headers: {
					Accept: 'application/rss+xml, */*',
				},
				timeout: 5000,
			});

			const text = await res.text();
			const feed = parseFeed(text, {
				xmlMode: true,
			});

			if (!feed) {
				throw new ApiError(meta.errors.fetchFailed);
			}

			return {
				type: feed.type,
				id: feed.id,
				title: feed.title,
				link: feed.link,
				description: feed.description,
				updated: feed.updated?.toISOString(),
				author: feed.author,
				items: feed.items
					.filter((item): item is FeedItem & { link: string, title: string } => !!item.link && !!item.title)
					.map(item => ({
						guid: item.id,
						title: item.title,
						link: item.link,
						description: item.description,
						pubDate: item.pubDate?.toISOString(),
						media: item.media.map(media => ({
							medium: media.medium,
							url: media.url,
							type: media.type,
							lang: media.lang,
						})),
					})),
			};
		});
	}
}
