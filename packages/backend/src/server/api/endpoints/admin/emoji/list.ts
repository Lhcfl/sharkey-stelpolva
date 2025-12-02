/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { EmojisRepository } from '@/models/_.js';
import type { MiEmoji } from '@/models/Emoji.js';
import { QueryService } from '@/core/QueryService.js';
import { DI } from '@/di-symbols.js';
import { EmojiEntityService } from '@/core/entities/EmojiEntityService.js';
//import { sqlLikeEscape } from '@/misc/sql-like-escape.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requiredRolePolicy: 'canManageCustomEmojis',
	kind: 'read:admin:emoji',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: {
					type: 'string',
					optional: false, nullable: false,
					format: 'id',
				},
				aliases: {
					type: 'array',
					optional: false, nullable: false,
					items: {
						type: 'string',
						optional: false, nullable: false,
					},
				},
				name: {
					type: 'string',
					optional: false, nullable: false,
				},
				category: {
					type: 'string',
					optional: false, nullable: true,
				},
				host: {
					type: 'string',
					optional: false, nullable: true,
					description: 'The local host is represented with `null`. The field exists for compatibility with other API endpoints that return files.',
				},
				url: {
					type: 'string',
					optional: false, nullable: false,
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		query: { type: 'string', nullable: true, default: null },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', minimum: 1, nullable: true, default: null },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,

		private emojiEntityService: EmojiEntityService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const q = this.queryService.makePaginationQuery(this.emojisRepository.createQueryBuilder('emoji'), ps.sinceId, ps.untilId)
				.andWhere('emoji.host IS NULL');

			let emojis: MiEmoji[];

			if (ps.query) {
				//q.andWhere('emoji.name ILIKE :q', { q: `%${ sqlLikeEscape(ps.query) }%` });
				//const emojis = await q.limit(ps.limit).getMany();

				emojis = await q.orderBy('length(emoji.name)', 'ASC').addOrderBy('id', 'DESC').getMany();
				const queryarry = ps.query.match(/:([\p{Letter}\p{Number}\p{Mark}_+-]*):/ug);

				if (queryarry) {
					emojis = emojis.filter(emoji =>
						queryarry.includes(`:${emoji.name.normalize('NFC')}:`),
					);
				} else {
					const queryNfc = ps.query!.normalize('NFC');
					emojis = emojis.filter(emoji =>
						emoji.name.includes(queryNfc) ||
						emoji.aliases.some(a => a.includes(queryNfc)) ||
						emoji.category?.includes(queryNfc));
				}
				emojis = emojis.slice((ps.offset ?? 0), ((ps.offset ?? 0) + ps.limit));
			} else {
				emojis = await q.take(ps.limit).skip(ps.offset ?? 0).getMany();
			}

			return await this.emojiEntityService.packDetailedMany(emojis);
		});
	}
}
