/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import * as Redis from 'ioredis';
import { In, IsNull, Not } from 'typeorm';
import { EmojiEntityService } from '@/core/entities/EmojiEntityService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { IdService } from '@/core/IdService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import { MemoryKVCache, RedisSingleCache } from '@/misc/cache.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import type { DriveFilesRepository, EmojisRepository, MiRole, MiUser, MiDriveFile, NotesRepository } from '@/models/_.js';
import type { MiEmoji } from '@/models/Emoji.js';
import type { Serialized } from '@/types.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import type { Config } from '@/config.js';
import { DriveService } from '@/core/DriveService.js';
import { CacheManagementService, type ManagedQuantumKVCache } from '@/global/CacheManagementService.js';
import { TimeService } from '@/global/TimeService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { promiseMap } from '@/misc/promise-map.js';
import { isRetryableSymbol } from '@/misc/is-retryable-error.js';
import type Logger from '@/logger.js';
import { KeyNotFoundError } from '@/misc/errors/KeyNotFoundError.js';

// TODO move to sk-types.d.ts when merged
type MinEntity<T> = Omit<T, NullableProps<T>> & {
	[K in NullableProps<T>]?: T[K] | undefined;
};
type SemiPartial<T, P extends keyof T> = Omit<T, P> & {
	[Key in P]?: T[Key] | undefined;
};
type NullableProps<T> = {
	[K in keyof T]: null extends T[K] ? K : never;
}[keyof T];

const parseEmojiStrRegexp = /^([-\w]+)(?:@([\w.-]+))?$/;

export const fetchEmojisHostTypes = [
	'local',
	'remote',
	'all',
] as const;
export type FetchEmojisHostTypes = typeof fetchEmojisHostTypes[number];
export const fetchEmojisSortKeys = [
	'+id',
	'-id',
	'+updatedAt',
	'-updatedAt',
	'+name',
	'-name',
	'+host',
	'-host',
	'+uri',
	'-uri',
	'+publicUrl',
	'-publicUrl',
	'+type',
	'-type',
	'+aliases',
	'-aliases',
	'+category',
	'-category',
	'+license',
	'-license',
	'+isSensitive',
	'-isSensitive',
	'+localOnly',
	'-localOnly',
	'+roleIdsThatCanBeUsedThisEmojiAsReaction',
	'-roleIdsThatCanBeUsedThisEmojiAsReaction',
] as const;
export type FetchEmojisSortKeys = typeof fetchEmojisSortKeys[number];

@Injectable()
export class CustomEmojiService {
	// id -> MiEmoji
	public readonly emojisByIdCache: ManagedQuantumKVCache<MiEmoji>;

	// key ("name host") -> MiEmoji (for remote emojis)
	// key ("name") -> MiEmoji (for local emojis)
	public readonly emojisByKeyCache: ManagedQuantumKVCache<MiEmoji>;

	private readonly logger: Logger;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,
		@Inject(DI.config)
		private config: Config,
		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private utilityService: UtilityService,
		private idService: IdService,
		private emojiEntityService: EmojiEntityService,
		private moderationLogService: ModerationLogService,
		private globalEventService: GlobalEventService,
		private driveService: DriveService,
		private readonly timeService: TimeService,

		cacheManagementService: CacheManagementService,
		loggerService: LoggerService,
	) {
		this.logger = loggerService.getLogger('custom-emoji');

		this.emojisByIdCache = cacheManagementService.createQuantumKVCache<MiEmoji>('emojisById', {
			lifetime: 1000 * 60 * 60, // 1h
			fetcher: async (id) => await this.emojisRepository.findOneByOrFail({ id }),
			optionalFetcher: async (id) => await this.emojisRepository.findOneBy({ id }),
			bulkFetcher: async (ids) => {
				const emojis = await this.emojisRepository.findBy({ id: In(ids) });
				return emojis.map(emoji => [emoji.id, emoji]);
			},
		});

		this.emojisByKeyCache = cacheManagementService.createQuantumKVCache<MiEmoji>('emojisByKey', {
			lifetime: 1000 * 60 * 60, // 1h
			fetcher: async (key) => {
				const { host, name } = decodeEmojiKey(key);
				return await this.emojisRepository.findOneByOrFail({ host: host ?? IsNull(), name });
			},
			optionalFetcher: async (key) => {
				const { host, name } = decodeEmojiKey(key);
				return await this.emojisRepository.findOneBy({ host: host ?? IsNull(), name });
			},
			bulkFetcher: async (keys) => {
				const queries = keys.map(key => {
					const { host, name } = decodeEmojiKey(key);
					return { host: host ?? IsNull(), name };
				});
				const emojis = await this.emojisRepository.findBy(queries);
				return emojis.map(emoji => [encodeEmojiKey(emoji), emoji]);
			},
		});
	}

	/** @deprecated use createEmoji for new code */
	@bindThis
	public async add(data: {
		originalUrl: string;
		publicUrl: string;
		fileType: string;
		name: string;
		category: string | null;
		aliases: string[];
		host: string | null;
		license: string | null;
		isSensitive: boolean;
		localOnly: boolean;
		roleIdsThatCanBeUsedThisEmojiAsReaction: MiRole['id'][];
	}, moderator?: MiUser): Promise<MiEmoji> {
		return await this.createEmoji(data, { moderator });
	}

	public async createEmoji(
		data: SemiPartial<MinEntity<MiEmoji>, 'id' | 'updatedAt' | 'aliases' | 'roleIdsThatCanBeUsedThisEmojiAsReaction'>,
		opts?: { moderator?: { id: string } },
	): Promise<MiEmoji> {
		// Set defaults
		data.id ??= this.idService.gen();
		data.updatedAt ??= this.timeService.date;
		data.aliases ??= [];
		data.roleIdsThatCanBeUsedThisEmojiAsReaction ??= [];

		// Add to logs
		this.logger.info(`Creating emoji name=${data.name} host=${data.host}...`);

		// Add to database
		await this.emojisRepository.insert(data);

		// Add to cache
		const emoji = await this.emojisByIdCache.fetch(data.id);
		const emojiKey = encodeEmojiKey({ name: emoji.name, host: emoji.host });
		this.emojisByIdCache.add(emojiKey, emoji); // This is a new entity, so we can use add() which does not emit sync events.

		if (emoji.host == null) {
			// Add to clients
			await this.globalEventService.publishBroadcastStream('emojiAdded', {
				emoji: await this.emojiEntityService.packDetailed(emoji),
			});

			// Add to mod logs
			if (opts?.moderator) {
				await this.moderationLogService.log(opts.moderator, 'addCustomEmoji', {
					emojiId: emoji.id,
					emoji: emoji,
				});
			}
		}

		return emoji;
	}

	/** @deprecated Use updateEmoji for new code */
	@bindThis
	public async update(data: (
		{ id: MiEmoji['id'], name?: string; } | { name: string; id?: MiEmoji['id'], }
	) & {
		originalUrl?: string;
		publicUrl?: string;
		fileType?: string;
		category?: string | null;
		aliases?: string[];
		license?: string | null;
		isSensitive?: boolean;
		localOnly?: boolean;
		roleIdsThatCanBeUsedThisEmojiAsReaction?: MiRole['id'][];
	}, moderator?: MiUser): Promise<
		null
		| 'NO_SUCH_EMOJI'
		| 'SAME_NAME_EMOJI_EXISTS'
		> {
		try {
			const criteria = data.id
				? { id: data.id as string }
				: { name: data.name as string, host: null };

			const updates = {
				...data,
				id: undefined,
				host: undefined,
			};

			const opts = {
				moderator,
			};

			await this.updateEmoji(criteria, updates, opts);
			return null;
		} catch (err) {
			if (err instanceof KeyNotFoundError) return 'NO_SUCH_EMOJI';
			if (err instanceof DuplicateEmojiError) return 'SAME_NAME_EMOJI_EXISTS';
			throw err;
		}
	}

	@bindThis
	public async updateEmoji(
		criteria: { id: string } | { name: string, host: string | null },
		data: Omit<Partial<MiEmoji>, 'id' | 'host'>,
		opts?: { moderator?: { id: string } },
	): Promise<MiEmoji> {
		const emoji = 'id' in criteria
			? await this.emojisByIdCache.fetch(criteria.id)
			: await this.emojisByKeyCache.fetch(encodeEmojiKey(criteria));

		// Update the system logs
		this.logger.info(`Updating emoji name=${emoji.name} host=${emoji.host}...`);

		// If changing the name, then make sure we don't have a conflict.
		const doNameUpdate = data.name !== undefined && data.name !== emoji.name;
		if (doNameUpdate) {
			const isDuplicate = await this.checkDuplicate(data.name as string, emoji.host);
			if (isDuplicate) throw new DuplicateEmojiError(data.name as string, emoji.host);
		}

		// Make sure we always set the updated date!
		data.updatedAt ??= this.timeService.date;

		// Update the database
		await this.emojisRepository.update({ id: emoji.id }, data);

		// Update the caches
		const updated = await this.emojisByIdCache.refresh(emoji.id);
		const updatedKey = encodeEmojiKey({ name: emoji.name, host: emoji.host });
		await this.emojisByKeyCache.set(updatedKey, updated);

		// Update the file
		await this.updateEmojiFile(emoji, updated);

		// If it's a remote emoji, then we're done.
		// The remaining logic applies only to local emojis.
		if (updated.host != null) {
			return updated;
		}

		// Update the clients
		if (!doNameUpdate) {
			// If name is the same, then we can update in-place
			const packed = await this.emojiEntityService.packDetailed(updated);
			await this.globalEventService.publishBroadcastStream('emojiUpdated', {
				emojis: [packed],
			});
		} else {
			// If name has changed, we need to delete and recreate
			const [oldPacked, newPacked] = await Promise.all([
				this.emojiEntityService.packDetailed(emoji),
				this.emojiEntityService.packDetailed(updated),
			]);

			await this.globalEventService.publishBroadcastStream('emojiDeleted', {
				emojis: [oldPacked],
			});

			await this.globalEventService.publishBroadcastStream('emojiAdded', {
				emoji: newPacked,
			});
		}

		// Update the mod logs
		if (opts?.moderator) {
			await this.moderationLogService.log(opts.moderator, 'updateCustomEmoji', {
				emojiId: emoji.id,
				before: emoji,
				after: updated,
			});
		}

		return updated;
	}

	@bindThis
	private async updateEmojiFile(before: MiEmoji, after: MiEmoji, moderator?: { id: string }): Promise<void> {
		// Nothing to do
		if (after.originalUrl === before.originalUrl) {
			return;
		}

		// If we're changing the file, then we need to delete the old one.
		const [oldFile, newFile] = await Promise.all([
			this.driveFilesRepository.findOneBy({ url: before.originalUrl, userHost: before.host ?? IsNull() }),
			this.driveFilesRepository.findOneBy({ url: after.originalUrl, userHost: after.host ?? IsNull() }),
		]);

		// But DON'T delete if this is the same file reference, otherwise we'll break the emoji!
		if (!oldFile || !newFile || oldFile.id === newFile.id) {
			return;
		}

		await this.safeDeleteEmojiFile(before, oldFile, moderator);
	}

	@bindThis
	private async safeDeleteEmojiFile(emoji: MiEmoji, file: MiDriveFile, moderator?: { id: string }): Promise<void> {
		const [hasNoteReferences, hasEmojiReferences] = await Promise.all([
			// Any note using this file ID is a reference.
			this.notesRepository
				.createQueryBuilder('note')
				.where(':fileId <@ note.fileIds', { fileId: file.id })
				.getExists(),
			// Any *other* emoji using this file URL is a reference.
			this.emojisRepository.existsBy({
				originalUrl: file.url,
				id: Not(emoji.id),
			}),
		]);

		if (hasNoteReferences) {
			this.logger.debug(`Not removing old file ${file.id} (${file.url}) - file is referenced by one or more notes.`);
		} else if (hasEmojiReferences) {
			this.logger.debug(`Not removing old file ${file.id} (${file.url}) - file is reference by another emoji.`);
		} else {
			this.logger.info(`Removing old file ${file.id} (${file.url}).`);
			await this.driveService.deleteFile(file, false, moderator);
		}
	}

	@bindThis
	public async addAliasesBulk(ids: MiEmoji['id'][], aliases: string[]) {
		await this.bulkUpdateEmojis(ids, async emojis => {
			for (const emoji of emojis) {
				await this.emojisRepository.update(emoji.id, {
					updatedAt: this.timeService.date,
					aliases: [...new Set(emoji.aliases.concat(aliases))],
				});
			}
		});
	}

	@bindThis
	public async setAliasesBulk(ids: MiEmoji['id'][], aliases: string[]) {
		await this.emojisRepository.update({
			id: In(ids),
		}, {
			updatedAt: this.timeService.date,
			aliases: aliases,
		});

		await this.bulkUpdateEmojis(ids);
	}

	@bindThis
	public async removeAliasesBulk(ids: MiEmoji['id'][], aliases: string[]) {
		await this.bulkUpdateEmojis(ids, async emojis => {
			for (const emoji of emojis) {
				await this.emojisRepository.update(emoji.id, {
					updatedAt: this.timeService.date,
					aliases: emoji.aliases.filter(x => !aliases.includes(x)),
				});
			}
		});
	}

	@bindThis
	public async setCategoryBulk(ids: MiEmoji['id'][], category: string | null) {
		await this.emojisRepository.update({
			id: In(ids),
		}, {
			updatedAt: this.timeService.date,
			category: category,
		});

		await this.bulkUpdateEmojis(ids);
	}

	@bindThis
	public async setLicenseBulk(ids: MiEmoji['id'][], license: string | null) {
		await this.emojisRepository.update({
			id: In(ids),
		}, {
			updatedAt: this.timeService.date,
			license: license,
		});

		await this.bulkUpdateEmojis(ids);
	}

	@bindThis
	private async bulkUpdateEmojis(ids: MiEmoji['id'][], updater?: (emojis: readonly MiEmoji[]) => Promise<void>): Promise<void> {
		// Update the database
		if (updater) {
			const emojis = await this.emojisByIdCache.fetchMany(ids);
			await updater(emojis.values);
		}

		// Update the caches
		const updated = await this.emojisByIdCache.refreshMany(ids);
		const keyUpdates = updated.values.map(emoji => [encodeEmojiKey(emoji), emoji] as const);
		await this.emojisByKeyCache.setMany(keyUpdates);

		// Update the clients
		await this.globalEventService.publishBroadcastStream('emojiUpdated', {
			emojis: await this.emojiEntityService.packDetailedMany(updated.values),
		});
	}

	@bindThis
	public async delete(id: MiEmoji['id'], moderator?: { id: string }) {
		const emoji = await this.emojisByIdCache.fetch(id);

		await Promise.all([
			this.emojisRepository.delete(emoji.id),
			this.emojisByIdCache.delete(emoji.id),
			this.emojisByKeyCache.delete(encodeEmojiKey(emoji)),
		]);

		const file = await this.driveFilesRepository.findOneBy({ url: emoji.originalUrl, userHost: emoji.host ?? IsNull() });

		if (file) {
			await this.safeDeleteEmojiFile(emoji, file, moderator);
		}

		if (emoji.host == null) {
			await this.globalEventService.publishBroadcastStream('emojiDeleted', {
				emojis: [await this.emojiEntityService.packDetailed(emoji)],
			});

			if (moderator) {
				await this.moderationLogService.log(moderator, 'deleteCustomEmoji', {
					emojiId: emoji.id,
					emoji: emoji,
				});
			}
		}
	}

	@bindThis
	public async deleteBulk(ids: MiEmoji['id'][], moderator?: MiUser) {
		const emojis = await this.emojisByIdCache.fetchMany(ids);

		const filesQueries = emojis.values.map(emoji => ({
			url: emoji.originalUrl,
			userHost: emoji.host ?? IsNull(),
		}));
		const files = await this.driveFilesRepository.findBy(filesQueries);

		const emojiFiles = emojis.values
			.map(emoji => {
				const file = files.find(file => file.url === emoji.originalUrl && file.userHost === emoji.host);
				return [emoji, file];
			})
			.filter(ef => ef[1] != null) as [MiEmoji, MiDriveFile][];

		const localDeleted = emojis.values.filter(emoji => emoji.host == null);
		const deletedKeys = emojis.values.map(emoji => encodeEmojiKey(emoji));
		await Promise.all([
			// Delete from database
			this.emojisRepository.delete({ id: In(ids) }),
			this.emojisByIdCache.deleteMany(ids),

			// Delete from cache
			this.emojisByKeyCache.deleteMany(deletedKeys),

			// Delete from clients
			localDeleted.length > 0
				? this.emojiEntityService.packDetailedMany(localDeleted).then(async packed => {
					await this.globalEventService.publishBroadcastStream('emojiDeleted', {
						emojis: packed,
					});
				})
				: null,

			// Delete from mod logs
			localDeleted.length > 0 && moderator != null
				? Promise.all(localDeleted.map(async emoji => {
					await this.moderationLogService.log(moderator, 'deleteCustomEmoji', {
						emojiId: emoji.id,
						emoji: emoji,
					});
				}))
				: null,

			// Delete from drive
			emojiFiles.length > 0
				? Promise.all(emojiFiles.map(async ([emoji, file]) => {
					await this.safeDeleteEmojiFile(emoji, file, moderator);
				}))
				: null,
		]);
	}

	@bindThis
	private normalizeHost(src: string | undefined, noteUserHost: string | null): string | null {
		// クエリに使うホスト
		let host = src === '.' ? null	// .はローカルホスト (ここがマッチするのはリアクションのみ)
			: src === undefined ? noteUserHost	// ノートなどでホスト省略表記の場合はローカルホスト (ここがリアクションにマッチすることはない)
			: this.utilityService.isSelfHost(src) ? null	// 自ホスト指定
			: (src || noteUserHost);	// 指定されたホスト || ノートなどの所有者のホスト (こっちがリアクションにマッチすることはない)

		host = this.utilityService.toPunyNullable(host);

		return host;
	}

	@bindThis
	public parseEmojiStr(emojiName: string, noteUserHost: string | null) {
		const match = emojiName.match(parseEmojiStrRegexp);
		if (!match) return { name: null, host: null };

		const name = match[1];

		// ホスト正規化
		const host = this.utilityService.toPunyNullable(this.normalizeHost(match[2], noteUserHost));

		return { name, host };
	}

	/**
	 * 添付用(リモート)カスタム絵文字URLを解決する
	 * @param emojiName ノートやユーザープロフィールに添付された、またはリアクションのカスタム絵文字名 (:は含めない, リアクションでローカルホストの場合は@.を付ける (これはdecodeReactionで可能))
	 * @param noteUserHost ノートやユーザープロフィールの所有者のホスト
	 * @returns URL, nullは未マッチを意味する
	 */
	@bindThis
	public async populateEmoji(emojiName: string, noteUserHost: string | null): Promise<string | null> {
		const emojiKey = this.translateEmojiKey(emojiName, noteUserHost);
		if (emojiKey == null) return null;

		const emoji = await this.emojisByKeyCache.fetchMaybe(emojiKey);

		if (emoji == null) return null;
		return emoji.publicUrl || emoji.originalUrl; // || emoji.originalUrl してるのは後方互換性のため（publicUrlはstringなので??はだめ）
	}

	/**
	 * 複数の添付用(リモート)カスタム絵文字URLを解決する (キャシュ付き, 存在しないものは結果から除外される)
	 */
	@bindThis
	public async populateEmojis(emojiNames: string[], noteUserHost: string | null): Promise<Record<string, string>> {
		const emojis = await promiseMap(emojiNames, async x => await this.populateEmoji(x, noteUserHost), { limit: 4 });
		const res = {} as Record<string, string>;
		for (let i = 0; i < emojiNames.length; i++) {
			const resolvedEmoji = emojis[i];
			if (resolvedEmoji != null) {
				res[emojiNames[i]] = resolvedEmoji;
			}
		}
		return res;
	}

	@bindThis
	private translateEmojiKey(emojiName: string, noteUserHost: string | null): string | null {
		const { name, host } = this.parseEmojiStr(emojiName, noteUserHost);
		if (name == null) return null;
		if (host == null) return null;

		const newHost = host === this.config.host ? null : host;
		return encodeEmojiKey({ name, host: newHost });
	}

	/**
	 * 与えられた絵文字のリストをデータベースから取得し、キャッシュに追加します
	 */
	@bindThis
	public async prefetchEmojis(emojis: { name: string; host: string | null; }[]): Promise<void> {
		const emojiKeys = emojis.map(emoji => encodeEmojiKey(emoji));
		await this.emojisByKeyCache.fetchMany(emojiKeys);
	}

	/**
	 * ローカル内の絵文字に重複がないかチェックします
	 * @param name 絵文字名
	 * @param host Emoji hostname
	 */
	@bindThis
	public async checkDuplicate(name: string, host: string | null = null): Promise<boolean> {
		const emoji = await this.getEmojiByName(name, host);
		return emoji != null;
	}

	@bindThis
	public async getEmojiById(id: string): Promise<MiEmoji | null> {
		return await this.emojisByIdCache.fetchMaybe(id) ?? null;
	}

	@bindThis
	public async getEmojiByName(name: string, host: string | null = null): Promise<MiEmoji | null> {
		const emojiKey = encodeEmojiKey({ name, host });
		return await this.emojisByKeyCache.fetchMaybe(emojiKey) ?? null;
	}

	@bindThis
	public async fetchEmojis(
		params?: {
			query?: {
				updatedAtFrom?: string;
				updatedAtTo?: string;
				name?: string;
				host?: string;
				uri?: string;
				publicUrl?: string;
				type?: string;
				aliases?: string;
				category?: string;
				license?: string;
				isSensitive?: boolean;
				localOnly?: boolean;
				hostType?: FetchEmojisHostTypes;
				roleIds?: string[];
			},
			sinceId?: string;
			untilId?: string;
		},
		opts?: {
			limit?: number;
			page?: number;
			sortKeys?: FetchEmojisSortKeys[]
		},
	) {
		function multipleWordsToQuery(words: string) {
			return words.split(/\s/).filter(x => x.length > 0).map(x => `%${sqlLikeEscape(x)}%`);
		}

		const builder = this.emojisRepository.createQueryBuilder('emoji');
		if (params?.query) {
			const q = params.query;
			if (q.updatedAtFrom) {
				// noIndexScan
				builder.andWhere('CAST(emoji.updatedAt AS DATE) >= :updatedAtFrom', { updatedAtFrom: q.updatedAtFrom });
			}
			if (q.updatedAtTo) {
				// noIndexScan
				builder.andWhere('CAST(emoji.updatedAt AS DATE) <= :updatedAtTo', { updatedAtTo: q.updatedAtTo });
			}
			if (q.name) {
				builder.andWhere('emoji.name ~~ ANY(ARRAY[:...name])', { name: multipleWordsToQuery(q.name) });
			}

			switch (true) {
				case q.hostType === 'local': {
					builder.andWhere('emoji.host IS NULL');
					break;
				}
				case q.hostType === 'remote': {
					if (q.host) {
						// noIndexScan
						builder.andWhere('emoji.host ~~ ANY(ARRAY[:...host])', { host: multipleWordsToQuery(q.host) });
					} else {
						builder.andWhere('emoji.host IS NOT NULL');
					}
					break;
				}
			}

			if (q.uri) {
				// noIndexScan
				builder.andWhere('emoji.uri ~~ ANY(ARRAY[:...uri])', { uri: multipleWordsToQuery(q.uri) });
			}
			if (q.publicUrl) {
				// noIndexScan
				builder.andWhere('emoji.publicUrl ~~ ANY(ARRAY[:...publicUrl])', { publicUrl: multipleWordsToQuery(q.publicUrl) });
			}
			if (q.type) {
				// noIndexScan
				builder.andWhere('emoji.type ~~ ANY(ARRAY[:...type])', { type: multipleWordsToQuery(q.type) });
			}
			if (q.aliases) {
				// noIndexScan
				const subQueryBuilder = builder.subQuery()
					.select('COUNT(0)', 'count')
					.from(
						sq2 => sq2
							.select('unnest(subEmoji.aliases)', 'alias')
							.addSelect('subEmoji.id', 'id')
							.from('emoji', 'subEmoji'),
						'aliasTable',
					)
					.where('"emoji"."id" = "aliasTable"."id"')
					.andWhere('"aliasTable"."alias" ~~ ANY(ARRAY[:...aliases])', { aliases: multipleWordsToQuery(q.aliases) });

				builder.andWhere(`(${subQueryBuilder.getQuery()}) > 0`);
			}
			if (q.category) {
				builder.andWhere('emoji.category ~~ ANY(ARRAY[:...category])', { category: multipleWordsToQuery(q.category) });
			}
			if (q.license) {
				// noIndexScan
				builder.andWhere('emoji.license ~~ ANY(ARRAY[:...license])', { license: multipleWordsToQuery(q.license) });
			}
			if (q.isSensitive != null) {
				// noIndexScan
				builder.andWhere('emoji.isSensitive = :isSensitive', { isSensitive: q.isSensitive });
			}
			if (q.localOnly != null) {
				// noIndexScan
				builder.andWhere('emoji.localOnly = :localOnly', { localOnly: q.localOnly });
			}
			if (q.roleIds && q.roleIds.length > 0) {
				builder.andWhere('emoji.roleIdsThatCanBeUsedThisEmojiAsReaction && ARRAY[:...roleIds]::VARCHAR[]', { roleIds: q.roleIds });
			}
		}

		if (params?.sinceId) {
			builder.andWhere('emoji.id > :sinceId', { sinceId: params.sinceId });
		}
		if (params?.untilId) {
			builder.andWhere('emoji.id < :untilId', { untilId: params.untilId });
		}

		if (opts?.sortKeys && opts.sortKeys.length > 0) {
			for (const sortKey of opts.sortKeys) {
				const direction = sortKey.startsWith('-') ? 'DESC' : 'ASC';
				const key = sortKey.replace(/^[+-]/, '');
				builder.addOrderBy(`emoji.${key}`, direction);
			}
		} else {
			builder.addOrderBy('emoji.id', 'DESC');
		}

		const limit = opts?.limit ?? 10;
		if (opts?.page) {
			builder.skip((opts.page - 1) * limit);
		}

		builder.take(limit);

		const [emojis, count] = await builder.getManyAndCount();

		return {
			emojis,
			count: (count > limit ? emojis.length : count),
			allCount: count,
			allPages: Math.ceil(count / limit),
		};
	}
}

export class InvalidEmojiError extends Error {
	// Fix the error name in stack traces - https://stackoverflow.com/a/71573071
	override name = this.constructor.name;

	public readonly [isRetryableSymbol] = false;
}

export class InvalidEmojiKeyError extends InvalidEmojiError {
	constructor(
		public readonly key: string,
		message?: string,
	) {
		const actualMessage = message
			? `Invalid emoji key "${key}": ${message}`
			: `Invalid emoji key "${key}".`;
		super(actualMessage);
	}
}

export class InvalidEmojiNameError extends InvalidEmojiError {
	constructor(
		public readonly name: string,
		message?: string,
	) {
		const actualMessage = message
			? `Invalid emoji name "${name}": ${message}`
			: `Invalid emoji name "${name}".`;
		super(actualMessage);
	}
}

export class InvalidEmojiHostError extends InvalidEmojiError {
	constructor(
		public readonly host: string | null,
		message?: string,
	) {
		const hostString = host == null ? 'null' : `"${host}"`;
		const actualMessage = message
			? `Invalid emoji name ${hostString}: ${message}`
			: `Invalid emoji name ${hostString}.`;
		super(actualMessage);
	}
}

export class DuplicateEmojiError extends InvalidEmojiError {
	constructor(
		public readonly name: string,
		public readonly host: string | null,
		message?: string,
	) {
		const hostString = host == null ? 'null' : `"${host}"`;
		const actualMessage = message
			? `Duplicate emoji name "${name}" for host ${hostString}: ${message}`
			: `Duplicate emoji name "${name}" for host ${hostString}.`;
		super(actualMessage);
	}
}

export function isValidEmojiName(name: string): boolean {
	return name !== '' && !name.includes(' ');
}

export function isValidEmojiHost(host: string): boolean {
	return host !== '' && !host.includes(' ');
}

// TODO unit tests
export function encodeEmojiKey(emoji: { name: string, host: string | null }): string {
	if (emoji.name === '') throw new InvalidEmojiNameError(emoji.name, 'Name cannot be empty.');
	if (emoji.name.includes(' ')) throw new InvalidEmojiNameError(emoji.name, 'Name cannot contain a space.');

	// Local emojis are just the name.
	if (emoji.host == null) {
		return emoji.name;
	}

	if (emoji.host === '') throw new InvalidEmojiHostError(emoji.host, 'Host cannot be empty.');
	if (emoji.host.includes(' ')) throw new InvalidEmojiHostError(emoji.host, 'Host cannot contain a space.');
	return `${emoji.name} ${emoji.host}`;
}

// TODO unit tests
export function decodeEmojiKey(key: string): { name: string, host: string | null } {
	const match = key.match(/^([^ ]+)(?: ([^ ]+))?$/);
	if (!match) {
		throw new InvalidEmojiKeyError(key);
	}

	const name = match[1];
	const host = match[2] || null;
	return { name, host };
}
