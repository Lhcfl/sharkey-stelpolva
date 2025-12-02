/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { EmojisRepository, MiEmoji } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { EmojiEntityService } from '@/core/entities/EmojiEntityService.js';
import { DI } from '@/di-symbols.js';
import { CacheManagementService, type ManagedMemorySingleCache } from '@/global/CacheManagementService.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';

export const meta = {
	tags: ['meta'],

	requireCredential: false,
	allowGet: true,
	cacheSec: 3600,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			emojis: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'EmojiSimple',
				},
			},
		},
	},

	// Up to 20 calls, then 5 / second
	limit: {
		type: 'bucket',
		size: 20,
		dripRate: 200,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	// Short (2 second) cache to handle rapid bursts of fetching the emoji list.
	// This just stores the IDs - the actual emojis are cached by CustomEmojiService
	private readonly localEmojiIdsCache: ManagedMemorySingleCache<MiEmoji['id'][]>;

	constructor(
		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,

		private emojiEntityService: EmojiEntityService,
		private readonly customEmojiService: CustomEmojiService,

		cacheManagementService: CacheManagementService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Fetch the latest emoji list
			const emojiIds = await this.localEmojiIdsCache.fetch(async () => {
				const emojis = await this.emojisRepository.createQueryBuilder('emoji')
					.select('emoji.id')
					.where({ host: IsNull() })
					.orderBy('LOWER(emoji.category)', 'ASC')
					.addOrderBy('LOWER(emoji.name)', 'ASC')
					.getMany() as { id: MiEmoji['id'] }[];

				return emojis.map(e => e.id);
			});

			// Fetch the latest version of each emoji
			const emojis = await this.customEmojiService.emojisByIdCache.fetchMany(emojiIds);

			// Pack and return everything
			return {
				emojis: await this.emojiEntityService.packSimpleMany(emojis.values),
			};
		});

		this.localEmojiIdsCache = cacheManagementService.createMemorySingleCache<MiEmoji['id'][]>('localEmojis', 1000 * 2);
	}
}
