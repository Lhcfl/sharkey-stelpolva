/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { EmojisRepository, MiRole, RolesRepository } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiEmoji } from '@/models/Emoji.js';
import { bindThis } from '@/decorators.js';
import type { CustomEmojiService } from '@/core/CustomEmojiService.js';

@Injectable()
export class EmojiEntityService implements OnModuleInit {
	private customEmojiService: CustomEmojiService;

	constructor(
		private readonly moduleRef: ModuleRef,

		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,
		@Inject(DI.rolesRepository)
		private rolesRepository: RolesRepository,
	) {
	}

	@bindThis
	public onModuleInit(): void {
		this.customEmojiService = this.moduleRef.get('CustomEmojiService');
	}

	@bindThis
	public async packSimple(
		src: MiEmoji['id'] | MiEmoji,
	): Promise<Packed<'EmojiSimple'>> {
		const emoji = typeof src === 'object' ? src : await this.customEmojiService.emojisByIdCache.fetch(src);

		return {
			aliases: emoji.aliases,
			name: emoji.name,
			category: emoji.category,
			// || emoji.originalUrl してるのは後方互換性のため（publicUrlはstringなので??はだめ）
			url: emoji.publicUrl || emoji.originalUrl,
			localOnly: emoji.localOnly ? true : undefined,
			isSensitive: emoji.isSensitive ? true : undefined,
			roleIdsThatCanBeUsedThisEmojiAsReaction: emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.length > 0 ? emoji.roleIdsThatCanBeUsedThisEmojiAsReaction : undefined,
		};
	}

	@bindThis
	public async packSimpleMany(
		emojis: readonly (MiEmoji | MiEmoji['id'])[],
	) {
		const toFetch = emojis.filter(emoji => typeof(emoji) === 'string');
		const fetched = new Map(await this.customEmojiService.emojisByIdCache.fetchMany(toFetch));
		return Promise.all(emojis.map(async x => {
			if (typeof(x) === 'string') {
				x = fetched.get(x) ?? await this.customEmojiService.emojisByIdCache.fetch(x);
			}
			return await this.packSimple(x);
		}));
	}

	@bindThis
	public async packDetailed(
		src: MiEmoji['id'] | MiEmoji,
	): Promise<Packed<'EmojiDetailed'>> {
		const emoji = typeof src === 'object' ? src : await this.customEmojiService.emojisByIdCache.fetch(src);

		return {
			id: emoji.id,
			aliases: emoji.aliases,
			name: emoji.name,
			category: emoji.category,
			host: emoji.host,
			// || emoji.originalUrl してるのは後方互換性のため（publicUrlはstringなので??はだめ）
			url: emoji.publicUrl || emoji.originalUrl,
			license: emoji.license,
			isSensitive: emoji.isSensitive,
			localOnly: emoji.localOnly,
			roleIdsThatCanBeUsedThisEmojiAsReaction: emoji.roleIdsThatCanBeUsedThisEmojiAsReaction,
		};
	}

	@bindThis
	public async packDetailedMany(
		emojis: readonly (MiEmoji | MiEmoji['id'])[],
	): Promise<Packed<'EmojiDetailed'>[]> {
		const toFetch = emojis.filter(emoji => typeof(emoji) === 'string');
		const fetched = new Map(await this.customEmojiService.emojisByIdCache.fetchMany(toFetch));
		return Promise.all(emojis.map(async x => {
			if (typeof(x) === 'string') {
				x = fetched.get(x) ?? await this.customEmojiService.emojisByIdCache.fetch(x);
			}
			return this.packDetailed(x);
		}));
	}

	@bindThis
	public async packDetailedAdmin(
		src: MiEmoji['id'] | MiEmoji,
		hint?: {
			roles?: Map<MiRole['id'], MiRole>
		},
	): Promise<Packed<'EmojiDetailedAdmin'>> {
		const emoji = typeof src === 'object' ? src : await this.customEmojiService.emojisByIdCache.fetch(src);

		const roles = Array.of<MiRole>();
		if (emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.length > 0) {
			if (hint?.roles) {
				const hintRoles = hint.roles;
				roles.push(
					...emoji.roleIdsThatCanBeUsedThisEmojiAsReaction
						.filter(x => hintRoles.has(x))
						.map(x => hintRoles.get(x)!),
				);
			} else {
				roles.push(
					...await this.rolesRepository.findBy({ id: In(emoji.roleIdsThatCanBeUsedThisEmojiAsReaction) }),
				);
			}

			roles.sort((a, b) => {
				if (a.displayOrder !== b.displayOrder) {
					return b.displayOrder - a.displayOrder;
				}

				return a.id.localeCompare(b.id);
			});
		}

		return {
			id: emoji.id,
			updatedAt: emoji.updatedAt?.toISOString() ?? null,
			name: emoji.name,
			host: emoji.host,
			uri: emoji.uri,
			type: emoji.type,
			aliases: emoji.aliases,
			category: emoji.category,
			publicUrl: emoji.publicUrl,
			originalUrl: emoji.originalUrl,
			license: emoji.license,
			localOnly: emoji.localOnly,
			isSensitive: emoji.isSensitive,
			roleIdsThatCanBeUsedThisEmojiAsReaction: roles.map(it => ({ id: it.id, name: it.name })),
		};
	}

	@bindThis
	public async packDetailedAdminMany(
		emojis: MiEmoji['id'][] | MiEmoji[],
		hint?: {
			roles?: Map<MiRole['id'], MiRole>
		},
	): Promise<Packed<'EmojiDetailedAdmin'>[]> {
		// IDのみの要素をピックアップし、DBからレコードを取り出して他の値を補完する
		const emojiEntities = emojis.filter(x => typeof x === 'object') as MiEmoji[];
		const emojiIdOnlyList = emojis.filter(x => typeof x === 'string') as string[];
		if (emojiIdOnlyList.length > 0) {
			const fetched = await this.customEmojiService.emojisByIdCache.fetchMany(emojiIdOnlyList);
			emojiEntities.push(...fetched.values);
		}

		// 特定ロール専用の絵文字である場合、そのロール情報をあらかじめまとめて取得しておく（pack側で都度取得も出来るが負荷が高いので）
		let hintRoles: Map<MiRole['id'], MiRole>;
		if (hint?.roles) {
			hintRoles = hint.roles;
		} else {
			const roles = Array.of<MiRole>();
			const roleIds = [...new Set(emojiEntities.flatMap(x => x.roleIdsThatCanBeUsedThisEmojiAsReaction))];
			if (roleIds.length > 0) {
				roles.push(...await this.rolesRepository.findBy({ id: In(roleIds) }));
			}

			hintRoles = new Map(roles.map(x => [x.id, x]));
		}

		return await Promise.all(emojis.map(x => this.packDetailedAdmin(x, { roles: hintRoles })));
	}
}

