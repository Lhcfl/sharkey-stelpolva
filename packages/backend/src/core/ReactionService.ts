/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DI } from '@/di-symbols.js';
import type { EmojisRepository, NoteReactionsRepository, UsersRepository, NotesRepository, MiMeta } from '@/models/_.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import type { MiRemoteUser, MiUser } from '@/models/User.js';
import { isLocalUser, isRemoteUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import { IdService } from '@/core/IdService.js';
import { MiNoteReaction } from '@/models/NoteReaction.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { NotificationService } from '@/core/NotificationService.js';
import PerUserReactionsChart from '@/core/chart/charts/per-user-reactions.js';
import { emojiRegex } from '@/misc/emoji-regex.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { bindThis } from '@/decorators.js';
import { UtilityService } from '@/core/UtilityService.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { CustomEmojiService, encodeEmojiKey } from '@/core/CustomEmojiService.js';
import { RoleService } from '@/core/RoleService.js';
import { FeaturedService } from '@/core/FeaturedService.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import { ReactionsBufferingService } from '@/core/ReactionsBufferingService.js';
import { PER_NOTE_REACTION_USER_PAIR_CACHE_MAX } from '@/const.js';
import { CacheService } from '@/core/CacheService.js';
import { NoteVisibilityService } from '@/core/NoteVisibilityService.js';
import { TimeService } from '@/global/TimeService.js';
import { CollapsedQueueService } from '@/core/CollapsedQueueService.js';
import type { DataSource } from 'typeorm';

const FALLBACK = '\u2764';

const legacies: Record<string, string> = {
	'like': '👍',
	'love': '\u2764', // ハート、異体字セレクタを入れない
	'laugh': '😆',
	'hmm': '🤔',
	'surprise': '😮',
	'congrats': '🎉',
	'angry': '💢',
	'confused': '😥',
	'rip': '😇',
	'pudding': '🍮',
	'star': '⭐',
};

type DecodedReaction = {
	/**
	 * リアクション名 (Unicode Emoji or ':name@hostname' or ':name@.')
	 */
	reaction: string;

	/**
	 * name (カスタム絵文字の場合name, Emojiクエリに使う)
	 */
	name?: string;

	/**
	 * host (カスタム絵文字の場合host, Emojiクエリに使う)
	 */
	host?: string | null;
};

const isCustomEmojiRegexp = /^:([\p{Letter}\p{Number}\p{Mark}_+-]+)(?:@\.)?:$/u;
const decodeCustomEmojiRegexp = /^:([\p{Letter}\p{Number}\p{Mark}_+-]+)(?:@([\w.-]+))?:$/u;

@Injectable()
export class ReactionService implements OnModuleInit {
	private roleService: RoleService;

	constructor(
		private readonly moduleRef: ModuleRef,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.noteReactionsRepository)
		private noteReactionsRepository: NoteReactionsRepository,

		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,

		@Inject(DI.db)
		private readonly db: DataSource,

		private utilityService: UtilityService,
		private customEmojiService: CustomEmojiService,
		private userBlockingService: UserBlockingService,
		private reactionsBufferingService: ReactionsBufferingService,
		private idService: IdService,
		private featuredService: FeaturedService,
		private globalEventService: GlobalEventService,
		private apRendererService: ApRendererService,
		private apDeliverManagerService: ApDeliverManagerService,
		private notificationService: NotificationService,
		private perUserReactionsChart: PerUserReactionsChart,
		private readonly cacheService: CacheService,
		private readonly noteVisibilityService: NoteVisibilityService,
		private readonly timeService: TimeService,
		private readonly collapsedQueueService: CollapsedQueueService,
	) {
	}

	@bindThis
	public onModuleInit() {
		this.roleService = this.moduleRef.get('RoleService');
	}

	@bindThis
	public async create(user: MiUser, note: MiNote, _reaction?: string | null) {
		// Check blocking / visibility
		if (note.userId !== user.id) {
			const { accessible } = await this.noteVisibilityService.checkNoteVisibilityAsync(note, user);
			if (!accessible) {
				throw new IdentifiableError('68e9d2d1-48bf-42c2-b90a-b20e09fd3d48', 'Note not accessible for you.');
			}
		}

		// Check if note is Renote
		if (isRenote(note) && !isQuote(note)) {
			throw new IdentifiableError('12c35529-3c79-4327-b1cc-e2cf63a71925', 'You cannot react to Renote.');
		}

		let reaction = _reaction ?? FALLBACK;

		if (note.reactionAcceptance === 'likeOnly' || ((note.reactionAcceptance === 'likeOnlyForRemote' || note.reactionAcceptance === 'nonSensitiveOnlyForLocalLikeOnlyForRemote') && (user.host != null))) {
			reaction = '\u2764';
		} else if (_reaction != null) {
			const custom = reaction.match(isCustomEmojiRegexp);
			if (custom) {
				const reacterHost = this.utilityService.toPunyNullable(user.host);

				const name = custom[1];
				const emojiKey = encodeEmojiKey({ name, host: reacterHost });
				const emoji = await this.customEmojiService.emojisByKeyCache.fetchMaybe(emojiKey);

				if (emoji) {
					if (emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.length === 0 || (await this.roleService.getUserRoles(user.id)).some(r => emoji.roleIdsThatCanBeUsedThisEmojiAsReaction.includes(r.id))) {
						reaction = reacterHost ? `:${name}@${reacterHost}:` : `:${name}:`;

						// センシティブ
						if ((note.reactionAcceptance === 'nonSensitiveOnly' || note.reactionAcceptance === 'nonSensitiveOnlyForLocalLikeOnlyForRemote') && emoji.isSensitive) {
							reaction = FALLBACK;
						}

						// for media silenced host, custom emoji reactions are not allowed
						if (reacterHost != null && this.utilityService.isMediaSilencedHost(this.meta.mediaSilencedHosts, reacterHost)) {
							reaction = FALLBACK;
						}
					} else {
						// リアクションとして使う権限がない
						reaction = FALLBACK;
					}
				} else {
					reaction = FALLBACK;
				}
			} else {
				reaction = this.normalize(reaction);
			}
		}

		const record: MiNoteReaction = {
			id: this.idService.gen(),
			noteId: note.id,
			userId: user.id,
			reaction,
		};

		const result = await this.db.transaction(async tem => {
			await tem.createQueryBuilder(MiNoteReaction, 'noteReaction')
				.insert()
				.values(record)
				.orIgnore()
				.execute();

			return await tem.createQueryBuilder(MiNoteReaction, 'noteReaction')
				.select()
				.where({ noteId: note.id, userId: user.id })
				.getOneOrFail();
		});

		if (result.id !== record.id) {
			// Conflict with the same ID => nothing to do.
			if (result.reaction === record.reaction) {
				return;
			}

			// 別のリアクションがすでにされていたら置き換える
			await this.delete(user, note);
			await this.noteReactionsRepository.insert(record);
		}

		// Increment reactions count
		if (this.meta.enableReactionsBuffering) {
			await this.reactionsBufferingService.create(note.id, user.id, reaction, note.reactionAndUserPairCache);
		} else {
			const sql = `jsonb_set("reactions", '{${reaction}}', (COALESCE("reactions"->>'${reaction}', '0')::int + 1)::text::jsonb)`;
			await this.notesRepository.createQueryBuilder().update()
				.set({
					reactions: () => sql,
					...(note.reactionAndUserPairCache.length < PER_NOTE_REACTION_USER_PAIR_CACHE_MAX ? {
						reactionAndUserPairCache: () => `array_append("reactionAndUserPairCache", '${user.id}/${reaction}')`,
					} : {}),
				})
				.where('id = :id', { id: note.id })
				.execute();
		}

		this.collapsedQueueService.updateUserQueue.enqueue(user.id, { updatedAt: this.timeService.date });

		// 30%の確率、セルフではない、3日以内に投稿されたノートの場合ハイライト用ランキング更新
		if (
			Math.random() < 0.3 &&
			note.userId !== user.id &&
			(this.timeService.now - this.idService.parse(note.id).date.getTime()) < 1000 * 60 * 60 * 24 * 3
		) {
			const author = await this.cacheService.findUserById(note.userId);
			if (author.isExplorable) {
				const policies = await this.roleService.getUserPolicies(author);
				if (policies.canTrend) {
					if (note.channelId != null) {
						if (note.replyId == null) {
							this.featuredService.updateInChannelNotesRanking(note.channelId, note, 1);
						}
					} else {
						if (note.visibility === 'public' && note.userHost == null && note.replyId == null) {
							this.featuredService.updateGlobalNotesRanking(note, 1);
							this.featuredService.updatePerUserNotesRanking(note.userId, note, 1);
						}
					}
				}
			}
		}

		if (this.meta.enableChartsForRemoteUser || (user.host == null)) {
			this.perUserReactionsChart.update(user, note);
		}

		// カスタム絵文字リアクションだったら絵文字情報も送る
		const decodedReaction = this.decodeReaction(reaction);

		// TODO this shouldn't be necessary - we can just reuse the same values as above
		const customEmojiKey = decodedReaction.name == null ? null : encodeEmojiKey({ name: decodedReaction.name, host: decodedReaction.host ?? null });
		const customEmoji = customEmojiKey == null ? null :
			await this.customEmojiService.emojisByKeyCache.fetchMaybe(customEmojiKey);

		this.globalEventService.publishNoteStream(note.id, 'reacted', {
			id: note.id,
			userId: note.userId,
			body: {
				reaction: decodedReaction.reaction,
				emoji: customEmoji != null ? {
					name: customEmoji.host ? `${customEmoji.name}@${customEmoji.host}` : `${customEmoji.name}@.`,
					// || emoji.originalUrl してるのは後方互換性のため（publicUrlはstringなので??はだめ）
					url: customEmoji.publicUrl || customEmoji.originalUrl,
				} : null,
				userId: user.id,
			},
		});

		// リアクションされたユーザーがローカルユーザーなら通知を作成
		if (note.userHost === null) {
			const threadId = note.threadId ?? note.id;
			const isThreadMuted = await this.cacheService.threadMutingsCache.fetch(note.userId).then(ms => ms.has(threadId));

			if (!isThreadMuted) {
				this.notificationService.createNotification(note.userId, 'reaction', {
					noteId: note.id,
					reaction: reaction,
				}, user.id);
			}
		}

		//#region 配信
		if (isLocalUser(user) && !note.localOnly) {
			const content = this.apRendererService.addContext(await this.apRendererService.renderLike(record, note));
			const dm = this.apDeliverManagerService.createDeliverManager(user, content);
			if (note.userHost !== null) {
				const reactee = await this.cacheService.findRemoteUserById(note.userId);
				dm.addDirectRecipe(reactee as MiRemoteUser);
			}

			if (['public', 'home', 'followers'].includes(note.visibility)) {
				dm.addFollowersRecipe();
			} else if (note.visibility === 'specified') {
				const visibleUsers = await this.cacheService.findUsersById(note.visibleUserIds);
				for (const u of visibleUsers.values()) {
					if (isRemoteUser(u)) {
						dm.addDirectRecipe(u as MiRemoteUser);
					}
				}
			}

			trackPromise(dm.execute());
		}
		//#endregion
	}

	@bindThis
	public async delete(user: MiUser, note: MiNote, exist?: MiNoteReaction | null) {
		// if already unreacted
		exist ??= await this.noteReactionsRepository.findOneBy({
			noteId: note.id,
			userId: user.id,
		});

		if (exist == null) {
			throw new IdentifiableError('60527ec9-b4cb-4a88-a6bd-32d3ad26817d', 'reaction does not exist');
		}

		// Delete reaction
		const result = await this.noteReactionsRepository.delete(exist.id);

		if (result.affected !== 1) {
			throw new IdentifiableError('60527ec9-b4cb-4a88-a6bd-32d3ad26817d', 'reaction does not exist');
		}

		// Decrement reactions count
		if (this.meta.enableReactionsBuffering) {
			await this.reactionsBufferingService.delete(note.id, user.id, exist.reaction);
		} else {
			const sql = `jsonb_set("reactions", '{${exist.reaction}}', (COALESCE("reactions"->>'${exist.reaction}', '0')::int - 1)::text::jsonb)`;
			await this.notesRepository.createQueryBuilder().update()
				.set({
					reactions: () => sql,
					reactionAndUserPairCache: () => `array_remove("reactionAndUserPairCache", '${user.id}/${exist.reaction}')`,
				})
				.where('id = :id', { id: note.id })
				.execute();
		}

		this.collapsedQueueService.updateUserQueue.enqueue(user.id, { updatedAt: this.timeService.date });

		this.globalEventService.publishNoteStream(note.id, 'unreacted', {
			id: note.id,
			userId: note.userId,
			body: {
				reaction: this.decodeReaction(exist.reaction).reaction,
				userId: user.id,
			},
		});

		//#region 配信
		if (isLocalUser(user) && !note.localOnly) {
			const content = this.apRendererService.addContext(this.apRendererService.renderUndo(await this.apRendererService.renderLike(exist, note), user));
			const dm = this.apDeliverManagerService.createDeliverManager(user, content);
			if (note.userHost !== null) {
				const reactee = await this.cacheService.findRemoteUserById(note.userId);
				dm.addDirectRecipe(reactee as MiRemoteUser);
			}
			dm.addFollowersRecipe();
			trackPromise(dm.execute());
		}
		//#endregion
	}

	/**
	 * @deprecated Use the exported function instead
	 */
	readonly convertLegacyReaction = convertLegacyReaction;

	/**
	 * @deprecated Use the exported function instead
	 */
	readonly convertLegacyReactions = convertLegacyReactions;

	/**
	 * @deprecated Use the exported function instead
	 */
	readonly normalize = normalize;

	/**
	 * @deprecated Use the exported function instead
	 */
	readonly decodeReaction = decodeReaction;
}

/**
 * - 文字列タイプのレガシーな形式のリアクションを現在の形式に変換する
 * - ローカルのリアクションのホストを `@.` にする（`decodeReaction()`の効果）
 */
export function convertLegacyReaction(reaction: string): string {
	reaction = decodeReaction(reaction).reaction;
	if (Object.keys(legacies).includes(reaction)) return legacies[reaction];
	return reaction;
}

// TODO: 廃止
/**
 * - 文字列タイプのレガシーな形式のリアクションを現在の形式に変換する
 * - ローカルのリアクションのホストを `@.` にする（`decodeReaction()`の効果）
 * - データベース上には存在する「0個のリアクションがついている」という情報を削除する
 */
export function convertLegacyReactions(reactions: MiNote['reactions']): MiNote['reactions'] {
	return Object.entries(reactions)
		.filter(([, count]) => {
			// `ReactionService.prototype.delete`ではリアクション削除時に、
			// `MiNote['reactions']`のエントリの値をデクリメントしているが、
			// デクリメントしているだけなのでエントリ自体は0を値として持つ形で残り続ける。
			// そのため、この処理がなければ、「0個のリアクションがついている」ということになってしまう。
			return count > 0;
		})
		.map(([reaction, count]) => {
			const key = convertLegacyReaction(reaction);

			return [key, count] as const;
		})
		.reduce<MiNote['reactions']>((acc, [key, count]) => {
			// unchecked indexed access
			const prevCount = acc[key] as number | undefined;

			acc[key] = (prevCount ?? 0) + count;

			return acc;
		}, {});
}

export function normalize(reaction: string | null): string {
	if (reaction == null) return FALLBACK;

	// 文字列タイプのリアクションを絵文字に変換
	if (Object.keys(legacies).includes(reaction)) return legacies[reaction];

	// Unicode絵文字
	const match = emojiRegex.exec(reaction);
	if (match) {
		// 合字を含む1つの絵文字
		const unicode = match[0];

		// 異体字セレクタ除去
		return unicode.match('\u200d') ? unicode : unicode.replace(/\ufe0f/g, '');
	}

	return FALLBACK;
}

export function decodeReaction(str: string): DecodedReaction {
	const custom = str.match(decodeCustomEmojiRegexp);

	if (custom) {
		const name = custom[1];
		const host = custom[2] ?? null;

		return {
			reaction: `:${name}@${host ?? '.'}:`,	// ローカル分は@以降を省略するのではなく.にする
			name,
			host,
		};
	}

	return {
		reaction: str,
		name: undefined,
		host: undefined,
	};
}
