/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { ModuleRef } from '@nestjs/core';
import { DI } from '@/di-symbols.js';
import type { Packed } from '@/misc/json-schema.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { MiUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import type { UsersRepository, NotesRepository, FollowingsRepository, PollsRepository, PollVotesRepository, NoteReactionsRepository, ChannelsRepository, MiMeta, MiPollVote, MiPoll, MiChannel, MiFollowing, NoteFavoritesRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { DebounceLoader } from '@/misc/loader.js';
import { IdService } from '@/core/IdService.js';
import type { Config } from '@/config.js';
import { ReactionsBufferingService } from '@/core/ReactionsBufferingService.js';
import { QueryService } from '@/core/QueryService.js';
import { NoteVisibilityService } from '@/core/NoteVisibilityService.js';
import type { NoteVisibilityData } from '@/core/NoteVisibilityService.js';
import type { OnModuleInit } from '@nestjs/common';
import type { CacheService } from '../CacheService.js';
import type { CustomEmojiService } from '../CustomEmojiService.js';
import type { ReactionService } from '../ReactionService.js';
import type { UserEntityService } from './UserEntityService.js';
import type { DriveFileEntityService } from './DriveFileEntityService.js';

// is-renote.tsとよしなにリンク
function isPureRenote(note: MiNote): note is MiNote & { renoteId: MiNote['id'] } {
	return (
		note.renoteId != null &&
		note.replyId == null &&
		note.text == null &&
		note.cw == null &&
		note.fileIds.length === 0 &&
		!note.hasPoll
	);
}

function getAppearNoteIds(notes: MiNote[]): Set<string> {
	const appearNoteIds = new Set<string>();
	for (const note of notes) {
		if (isPureRenote(note)) {
			appearNoteIds.add(note.renoteId);
			if (note.renote?.replyId) {
				appearNoteIds.add(note.renote.replyId);
			}
		} else {
			appearNoteIds.add(note.id);
			if (note.replyId) {
				appearNoteIds.add(note.replyId);
			}
		}
	}
	return appearNoteIds;
}

// noinspection ES6MissingAwait
@Injectable()
export class NoteEntityService implements OnModuleInit {
	private userEntityService: UserEntityService;
	private driveFileEntityService: DriveFileEntityService;
	private cacheService: CacheService;
	private customEmojiService: CustomEmojiService;
	private reactionService: ReactionService;
	private reactionsBufferingService: ReactionsBufferingService;
	private idService: IdService;
	private noteLoader = new DebounceLoader(this.findNoteOrFail);

	constructor(
		private moduleRef: ModuleRef,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.pollsRepository)
		private pollsRepository: PollsRepository,

		@Inject(DI.pollVotesRepository)
		private pollVotesRepository: PollVotesRepository,

		@Inject(DI.noteReactionsRepository)
		private noteReactionsRepository: NoteReactionsRepository,

		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		@Inject(DI.config)
		private readonly config: Config,

		@Inject(DI.noteFavoritesRepository)
		private noteFavoritesRepository: NoteFavoritesRepository,

		// This is public to avoid weaving a whole new service through the Channel class hierarchy.
		public readonly noteVisibilityService: NoteVisibilityService,

		private readonly queryService: QueryService,
		//private userEntityService: UserEntityService,
		//private driveFileEntityService: DriveFileEntityService,
		//private customEmojiService: CustomEmojiService,
		//private reactionService: ReactionService,
		//private reactionsBufferingService: ReactionsBufferingService,
		//private idService: IdService,
	) {
	}

	onModuleInit() {
		this.userEntityService = this.moduleRef.get('UserEntityService');
		this.driveFileEntityService = this.moduleRef.get('DriveFileEntityService');
		this.cacheService = this.moduleRef.get('CacheService');
		this.customEmojiService = this.moduleRef.get('CustomEmojiService');
		this.reactionService = this.moduleRef.get('ReactionService');
		this.reactionsBufferingService = this.moduleRef.get('ReactionsBufferingService');
		this.idService = this.moduleRef.get('IdService');
	}

	// Implementation moved to NoteVisibilityService
	/*
	@bindThis
	private treatVisibility(packedNote: Packed<'Note'>): Packed<'Note'>['visibility'] {
		if (packedNote.visibility === 'public' || packedNote.visibility === 'home') {
			const followersOnlyBefore = packedNote.user.makeNotesFollowersOnlyBefore;
			if ((followersOnlyBefore != null)
				&& (
					(followersOnlyBefore <= 0 && (Date.now() - new Date(packedNote.createdAt).getTime() > 0 - (followersOnlyBefore * 1000)))
					|| (followersOnlyBefore > 0 && (new Date(packedNote.createdAt).getTime() < followersOnlyBefore * 1000))
				)
			) {
				packedNote.visibility = 'followers';
			}
		}
		return packedNote.visibility;
	}
	*/

	@bindThis
	public async hideNotes(notes: Packed<'Note'>[], meId: string | null, hint?: Partial<NoteVisibilityData>): Promise<void> {
		const me = meId ? await this.cacheService.findUserById(meId) : null;
		const data = await this.noteVisibilityService.populateData(me, hint);

		for (const note of notes) {
			await this.hideNoteAsync(note, me, data);
		}
	}

	@bindThis
	public async hideNoteAsync(packedNote: Packed<'Note'>, me: string | Pick<MiUser, 'id' | 'host'> | null, hint?: Partial<NoteVisibilityData>): Promise<void> {
		const { redact, reason } = await this.noteVisibilityService.checkNoteVisibilityAsync(packedNote, me, { hint });

		if (redact) {
			this.redactNoteContents(packedNote, reason);
		}
	}

	private redactNoteContents(packedNote: Packed<'Note'>, reason?: string) {
		{
			packedNote.visibleUserIds = undefined;
			packedNote.fileIds = [];
			packedNote.files = [];
			packedNote.text = null;
			packedNote.poll = undefined;
			packedNote.cw = null;
			packedNote.repliesCount = 0;
			packedNote.reactionAcceptance = null;
			packedNote.reactionAndUserPairCache = undefined;
			packedNote.reactionCount = 0;
			packedNote.reactionEmojis = {};
			packedNote.reactions = {};
			packedNote.isHidden = true;
			packedNote.hiddenReason = reason;
			// TODO: hiddenReason みたいなのを提供しても良さそう
		}
	}

	@bindThis
	private async populatePoll(note: MiNote, meId: MiUser['id'] | null, hint?: {
		poll?: MiPoll,
		myVotes?: MiPollVote[],
	}) {
		const poll = hint?.poll ?? await this.pollsRepository.findOneByOrFail({ noteId: note.id });
		const choices = poll.choices.map(c => ({
			text: c,
			votes: poll.votes[poll.choices.indexOf(c)],
			isVoted: false,
		}));

		if (meId) {
			if (poll.multiple) {
				const votes = hint?.myVotes ?? await this.pollVotesRepository.findBy({
					userId: meId,
					noteId: note.id,
				});

				const myChoices = votes.map(v => v.choice);
				for (const myChoice of myChoices) {
					choices[myChoice].isVoted = true;
				}
			} else {
				const vote = hint?.myVotes ? hint.myVotes[0] : await this.pollVotesRepository.findOneBy({
					userId: meId,
					noteId: note.id,
				});

				if (vote) {
					choices[vote.choice].isVoted = true;
				}
			}
		}

		return {
			multiple: poll.multiple,
			expiresAt: poll.expiresAt?.toISOString() ?? null,
			choices,
		};
	}

	@bindThis
	public async populateMyNoteMutings(notes: Packed<'Note'>[], meId: string): Promise<Set<string>> {
		const mutedNotes = await this.cacheService.noteMutingsCache.fetch(meId);

		const mutedIds = notes
			.filter(note => mutedNotes.has(note.id))
			.map(note => note.id);
		return new Set(mutedIds);
	}

	@bindThis
	public async populateMyTheadMutings(notes: Packed<'Note'>[], meId: string): Promise<Set<string>> {
		const mutedThreads = await this.cacheService.threadMutingsCache.fetch(meId);

		const mutedIds = notes
			.filter(note => mutedThreads.has(note.threadId))
			.map(note => note.id);
		return new Set(mutedIds);
	}

	@bindThis
	public async populateMyRenotes(notes: Packed<'Note'>[], meId: string, _hint_?: {
		myRenotes: Set<string>;
	}): Promise<Set<string>> {
		const fetchedRenotes = new Set<string>();
		const toFetch = new Set<string>();

		if (_hint_) {
			for (const note of notes) {
				if (_hint_.myRenotes.has(note.id)) {
					fetchedRenotes.add(note.id);
				} else {
					toFetch.add(note.id);
				}
			}
		}

		if (toFetch.size > 0) {
			const fetched = await this.queryService
				.andIsRenote(this.notesRepository.createQueryBuilder('note'), 'note')
				.andWhere({
					userId: meId,
					renoteId: In(Array.from(toFetch)),
				})
				.select('note.renoteId', 'renoteId')
				.getRawMany<{ renoteId: string }>();

			for (const { renoteId } of fetched) {
				fetchedRenotes.add(renoteId);
			}
		}

		return fetchedRenotes;
	}

	@bindThis
	public async populateMyFavorites(notes: Packed<'Note'>[], meId: string, _hint_?: {
		myFavorites: Set<string>;
	}): Promise<Set<string>> {
		const fetchedFavorites = new Set<string>();
		const toFetch = new Set<string>();

		if (_hint_) {
			for (const note of notes) {
				if (_hint_.myFavorites.has(note.id)) {
					fetchedFavorites.add(note.id);
				} else {
					toFetch.add(note.id);
				}
			}
		}

		if (toFetch.size > 0) {
			const fetched = await this.noteFavoritesRepository.find({
				where: {
					userId: meId,
					noteId: In(Array.from(toFetch)),
				},
				select: {
					noteId: true,
				},
			}) as { noteId: string }[];

			for (const { noteId } of fetched) {
				fetchedFavorites.add(noteId);
			}
		}

		return fetchedFavorites;
	}

	@bindThis
	public async populateMyReactions(notes: Packed<'Note'>[], meId: string, _hint_?: {
		myReactions: Map<MiNote['id'], string | null>;
	}): Promise<Map<string, string>> {
		const fetchedReactions = new Map<string, string>();
		const toFetch = new Set<string>();

		if (_hint_) {
			for (const note of notes) {
				const fromHint = _hint_.myReactions.get(note.id);

				// null means we know there's no reaction, so just skip it.
				if (fromHint === null) continue;

				if (fromHint) {
					const converted = this.reactionService.convertLegacyReaction(fromHint);
					fetchedReactions.set(note.id, converted);
				} else if (Object.values(note.reactions).some(count => count > 0)) {
					// Note has at least one reaction, so we need to fetch
					toFetch.add(note.id);
				}
			}
		}

		if (toFetch.size > 0) {
			const fetched = await this.noteReactionsRepository.find({
				where: {
					userId: meId,
					noteId: In(Array.from(toFetch)),
				},
				select: {
					noteId: true,
					reaction: true,
				},
			});

			for (const { noteId, reaction } of fetched) {
				const converted = this.reactionService.convertLegacyReaction(reaction);
				fetchedReactions.set(noteId, converted);
			}
		}

		return fetchedReactions;
	}

	@bindThis
	public async populateMyReaction(note: { id: MiNote['id']; reactions: MiNote['reactions']; reactionAndUserPairCache?: MiNote['reactionAndUserPairCache']; }, meId: MiUser['id'], _hint_?: {
		myReactions: Map<MiNote['id'], string | null>;
	}) {
		if (_hint_?.myReactions) {
			const reaction = _hint_.myReactions.get(note.id);
			if (reaction) {
				return this.reactionService.convertLegacyReaction(reaction);
			} else if (reaction === null) {
				// the hints explicitly say this note has no reactions from
				// this user
				return undefined;
			}
		}

		const reactionsCount = Object.values(note.reactions).reduce((a, b) => a + b, 0);
		if (reactionsCount === 0) return undefined;
		if (note.reactionAndUserPairCache && reactionsCount <= note.reactionAndUserPairCache.length) {
			const pair = note.reactionAndUserPairCache.find(p => p.startsWith(meId));
			if (pair) {
				return this.reactionService.convertLegacyReaction(pair.split('/')[1]);
			} else {
				return undefined;
			}
		}

		// パフォーマンスのためノートが作成されてから2秒以上経っていない場合はリアクションを取得しない
		if (this.idService.parse(note.id).date.getTime() + 2000 > Date.now()) {
			return undefined;
		}

		const reaction = await this.noteReactionsRepository.findOne({
			where: {
				userId: meId,
				noteId: note.id,
			},
			select: {
				reaction: true,
			},
		});

		if (reaction) {
			return this.reactionService.convertLegacyReaction(reaction.reaction);
		}

		return undefined;
	}

	// Implementation moved to NoteVisibilityService
	/*
	@bindThis
	public async isVisibleForMe(note: MiNote, meId: MiUser['id'] | null, hint?: {
		myFollowing?: ReadonlySet<string>,
		myBlockers?: ReadonlySet<string>,
		me?: Pick<MiUser, 'id' | 'host'> | null,
	}): Promise<boolean> {
		const [myFollowings, myBlockers, me] = await Promise.all([
			hint?.myFollowing ?? (meId ? this.cacheService.userFollowingsCache.fetch(meId).then(fs => new Set(fs.keys())) : null),
			hint?.myBlockers ?? (meId ? this.cacheService.userBlockedCache.fetch(meId) : null),
			hint?.me ?? (meId ? this.cacheService.findUserById(meId) : null),
		]);

		return this.isVisibleForMeSync(note, me, myFollowings, myBlockers);
	}

	@bindThis
	public isVisibleForMeSync(note: MiNote | Packed<'Note'>, me: Pick<MiUser, 'id' | 'host'> | null, myFollowings: ReadonlySet<string> | null, myBlockers: ReadonlySet<string> | null): boolean {
		// We can always view our own notes
		if (me?.id === note.userId) {
			return true;
		}

		// We can *never* view blocked notes
		if (myBlockers?.has(note.userId)) {
			return false;
		}

		// This code must always be synchronized with the checks in generateVisibilityQuery.
		// visibility が specified かつ自分が指定されていなかったら非表示
		if (note.visibility === 'specified') {
			if (me == null) {
				return false;
			} else if (!note.visibleUserIds) {
				return false;
			} else {
				// 指定されているかどうか
				return note.visibleUserIds.includes(me.id);
			}
		}

		// visibility が followers かつ自分が投稿者のフォロワーでなかったら非表示
		if (note.visibility === 'followers') {
			if (me == null) {
				return false;
			} else if (note.reply && (me.id === note.reply.userId)) {
				// 自分の投稿に対するリプライ
				return true;
			} else if (!note.mentions) {
				return false;
			} else if (note.mentions.includes(me.id)) {
				// 自分へのメンション
				return true;
			} else if (!note.visibleUserIds) {
				return false;
			} else if (note.visibleUserIds.includes(me.id)) {
				// Explicitly visible to me
				return true;
			} else {
				// フォロワーかどうか
				const following = myFollowings?.has(note.userId);
				const userHost = me.host;

				// If we know the following, everyhting is fine.
				//
				// But if we do not know the following, it might be that both the
				// author of the note and the author of the like are remote users,
				// in which case we can never know the following. Instead we have
				// to assume that the users are following each other.
				return following || (note.userHost != null && userHost != null);
			}
		}

		return true;
	}
	*/

	@bindThis
	public async packAttachedFiles(fileIds: MiNote['fileIds'], packedFiles: Map<MiNote['fileIds'][number], Packed<'DriveFile'> | null>): Promise<Packed<'DriveFile'>[]> {
		const missingIds = [];
		for (const id of fileIds) {
			if (!packedFiles.has(id)) missingIds.push(id);
		}
		if (missingIds.length) {
			const additionalMap = await this.driveFileEntityService.packManyByIdsMap(missingIds);
			for (const [k, v] of additionalMap) {
				packedFiles.set(k, v);
			}
		}
		return fileIds.map(id => packedFiles.get(id)).filter(x => x != null);
	}

	@bindThis
	public async pack(
		src: MiNote['id'] | MiNote,
		me?: { id: MiUser['id'] } | null | undefined,
		options?: {
			detail?: boolean;
			skipHide?: boolean;
			withReactionAndUserPairCache?: boolean;
			bypassSilence?: boolean;
			_hint_?: {
				bufferedReactions: Map<MiNote['id'], { deltas: Record<string, number>; pairs: ([MiUser['id'], string])[] }> | null;
				myReactions: Map<MiNote['id'], string | null>;
				packedFiles: Map<MiNote['fileIds'][number], Packed<'DriveFile'> | null>;
				packedUsers: Map<MiUser['id'], Packed<'UserLite'>>;
				mentionHandles: Record<string, string | undefined>;
				userFollowings: Map<string, Map<string, Omit<MiFollowing, 'isFollowerHibernated'>>>;
				userBlockers: Map<string, Set<string>>;
				polls: Map<string, MiPoll>;
				pollVotes: Map<string, Map<string, MiPollVote[]>>;
				channels: Map<string, MiChannel>;
				notes: Map<string, MiNote>;
				mutedThreads: Set<string>;
				mutedNotes: Set<string>;
				favoriteNotes: Set<string>;
				renotedNotes: Set<string>;
			};
		},
	): Promise<Packed<'Note'>> {
		const opts = Object.assign({
			detail: true,
			skipHide: false,
			withReactionAndUserPairCache: false,
		}, options);

		const meId = me ? me.id : null;
		const note = typeof src === 'object' ? src : await this.noteLoader.load(src);
		const host = note.userHost;

		const bufferedReactions = opts._hint_?.bufferedReactions != null
			? (opts._hint_.bufferedReactions.get(note.id) ?? { deltas: {}, pairs: [] })
			: this.meta.enableReactionsBuffering
				? await this.reactionsBufferingService.get(note.id)
				: { deltas: {}, pairs: [] };
		const reactions = this.reactionService.convertLegacyReactions(this.reactionsBufferingService.mergeReactions(note.reactions, bufferedReactions.deltas ?? {}));

		const reactionAndUserPairCache = note.reactionAndUserPairCache.concat(bufferedReactions.pairs.map(x => x.join('/')));

		let text = note.text;

		if (note.name && (note.url ?? note.uri)) {
			text = `【${note.name}】\n${(note.text ?? '').trim()}\n\n${note.url ?? note.uri}`;
		}

		const channel = note.channelId
			? (opts._hint_?.channels.get(note.channelId) ?? note.channel ?? await this.channelsRepository.findOneBy({ id: note.channelId }))
			: null;

		const reactionEmojiNames = Object.keys(reactions)
			.filter(x => x.startsWith(':') && x.includes('@') && !x.includes('@.')) // リモートカスタム絵文字のみ
			.map(x => this.reactionService.decodeReaction(x).reaction.replaceAll(':', ''));
		const packedFiles = options?._hint_?.packedFiles;
		const packedUsers = options?._hint_?.packedUsers;

		const threadId = note.threadId ?? note.id;
		const [mutedThreads, mutedNotes, isFavorited, isRenoted] = await Promise.all([
			// mutedThreads
			opts._hint_?.mutedThreads
				?? (meId ? this.cacheService.threadMutingsCache.fetch(meId) : new Set<string>()),
			// mutedNotes
			opts._hint_?.mutedNotes
				?? (meId ? this.cacheService.noteMutingsCache.fetch(meId) : new Set<string>),
			// isFavorited
			opts._hint_?.favoriteNotes.has(note.id)
				?? (meId ? this.noteFavoritesRepository.existsBy({ userId: meId, noteId: note.id }) : false),
			// isRenoted
			opts._hint_?.renotedNotes.has(note.id)
				?? (meId ? this.queryService
					.andIsRenote(this.notesRepository.createQueryBuilder('note'), 'note')
					.andWhere({ renoteId: note.id, userId: meId })
					.getExists() : false),
		]);

		const bypassSilence = opts.bypassSilence || note.userId === meId;

		const packed: Packed<'Note'> = await awaitAll({
			id: note.id,
			threadId,
			createdAt: this.idService.parse(note.id).date.toISOString(),
			updatedAt: note.updatedAt ? note.updatedAt.toISOString() : undefined,
			userId: note.userId,
			userHost: note.userHost,
			user: packedUsers?.get(note.userId) ?? this.userEntityService.pack(note.user ?? note.userId, me),
			text: text,
			cw: note.cw,
			mandatoryCW: note.mandatoryCW,
			visibility: note.visibility,
			localOnly: note.localOnly,
			reactionAcceptance: note.reactionAcceptance,
			visibleUserIds: note.visibility === 'specified' ? note.visibleUserIds : undefined,
			renoteCount: note.renoteCount,
			repliesCount: note.repliesCount,
			reactionCount: Object.values(reactions).reduce((a, b) => a + b, 0),
			reactions: reactions,
			reactionEmojis: this.customEmojiService.populateEmojis(reactionEmojiNames, host),
			reactionAndUserPairCache: opts.withReactionAndUserPairCache ? reactionAndUserPairCache : undefined,
			emojis: host != null ? this.customEmojiService.populateEmojis(note.emojis, host) : undefined,
			tags: note.tags.length > 0 ? note.tags : undefined,
			fileIds: note.fileIds,
			files: packedFiles != null ? this.packAttachedFiles(note.fileIds, packedFiles) : this.driveFileEntityService.packManyByIds(note.fileIds),
			replyId: note.replyId,
			renoteId: note.renoteId,
			channelId: note.channelId ?? undefined,
			channel: channel ? {
				id: channel.id,
				name: channel.name,
				color: channel.color,
				isSensitive: channel.isSensitive,
				allowRenoteToExternal: channel.allowRenoteToExternal,
				userId: channel.userId,
			} : undefined,
			mentions: note.mentions.length > 0 ? note.mentions : undefined,
			mentionHandles: note.mentions.length > 0 ? this.getUserHandles(note.mentions, options?._hint_?.mentionHandles) : undefined,
			uri: note.uri ?? undefined,
			url: note.url ?? undefined,
			poll: note.hasPoll ? this.populatePoll(note, meId, {
				poll: opts._hint_?.polls.get(note.id),
				myVotes: opts._hint_?.pollVotes.get(note.id)?.get(note.userId),
			}) : undefined,
			isMutingThread: mutedThreads.has(threadId),
			isMutingNote: mutedNotes.has(note.id),
			isFavorited,
			isRenoted,
			bypassSilence,

			...(meId && Object.keys(reactions).length > 0 ? {
				myReaction: this.populateMyReaction({
					id: note.id,
					reactions: reactions,
					reactionAndUserPairCache: reactionAndUserPairCache,
				}, meId, options?._hint_),
			} : {}),

			...(opts.detail ? {
				clippedCount: note.clippedCount,
				processErrors: note.processErrors,

				reply: note.replyId ? this.pack(note.reply ?? opts._hint_?.notes.get(note.replyId) ?? note.replyId, me, {
					detail: false,
					skipHide: opts.skipHide,
					withReactionAndUserPairCache: opts.withReactionAndUserPairCache,
					_hint_: options?._hint_,

					// Don't silence target of self-reply, since the outer note will already be silenced.
					bypassSilence: bypassSilence || note.userId === note.replyUserId,
				}) : undefined,

				renote: note.renoteId ? this.pack(note.renote ?? opts._hint_?.notes.get(note.renoteId) ?? note.renoteId, me, {
					detail: true,
					skipHide: opts.skipHide,
					withReactionAndUserPairCache: opts.withReactionAndUserPairCache,
					_hint_: options?._hint_,

					// Don't silence target of self-renote, since the outer note will already be silenced.
					bypassSilence: bypassSilence || note.userId === note.renoteUserId,
				}) : undefined,
			} : {}),
		});

		this.noteVisibilityService.syncVisibility(packed);

		if (!opts.skipHide) {
			await this.hideNoteAsync(packed, meId, {
				userFollowings: meId ? opts._hint_?.userFollowings.get(meId) : null,
				userBlockers: meId ? opts._hint_?.userBlockers.get(meId) : null,
				userMutedNotes: opts._hint_?.mutedNotes,
				userMutedThreads: opts._hint_?.mutedThreads,
			});
		}

		return packed;
	}

	@bindThis
	public async packMany(
		notes: MiNote[],
		me?: { id: MiUser['id'] } | null | undefined,
		options?: {
			detail?: boolean;
			skipHide?: boolean;
			bypassSilence?: boolean;
		},
	) {
		if (notes.length === 0) return [];

		const targetNotes = await this.fetchRequiredNotes(notes, options?.detail ?? false);
		const noteIds = Array.from(new Set(targetNotes.map(n => n.id)));

		const usersMap = new Map<string, MiUser | string>();
		const allUsers = notes.flatMap(note => [
			note.user ?? note.userId,
			note.reply?.user ?? note.replyUserId,
			note.renote?.user ?? note.renoteUserId,
		]);

		for (const user of allUsers) {
			if (!user) continue;

			if (typeof(user) === 'object') {
				// ID -> Entity
				usersMap.set(user.id, user);
			} else if (!usersMap.has(user)) {
				// ID -> ID
				usersMap.set(user, user);
			}
		}

		const users = Array.from(usersMap.values());
		const userIds = Array.from(usersMap.keys());

		const fileIds = new Set(targetNotes.flatMap(n => n.fileIds));
		const mentionedUsers = new Set(targetNotes.flatMap(note => note.mentions));

		const [{ bufferedReactions, myReactionsMap }, packedFiles, packedUsers, mentionHandles, userFollowings, userBlockers, polls, pollVotes, channels, mutedThreads, mutedNotes, favoriteNotes, renotedNotes] = await Promise.all([
			// bufferedReactions & myReactionsMap
			this.getReactions(targetNotes, me),
			// packedFiles
			this.driveFileEntityService.packManyByIdsMap(Array.from(fileIds)),
			// packedUsers
			this.userEntityService.packMany(users, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			// mentionHandles
			this.getUserHandles(Array.from(mentionedUsers)),
			// userFollowings
			// TODO this might be wrong
			this.cacheService.userFollowingsCache.fetchMany(userIds).then(fs => new Map(fs)),
			// userBlockers
			this.cacheService.userBlockedCache.fetchMany(userIds).then(bs => new Map(bs)),
			// polls
			this.pollsRepository.findBy({ noteId: In(noteIds) })
				.then(polls => new Map(polls.map(p => [p.noteId, p]))),
			// pollVotes
			this.pollVotesRepository.findBy({ noteId: In(noteIds), userId: In(userIds) })
				.then(votes => votes.reduce((noteMap, vote) => {
					let userMap = noteMap.get(vote.noteId);
					if (!userMap) {
						userMap = new Map<string, MiPollVote[]>();
						noteMap.set(vote.noteId, userMap);
					}
					let voteList = userMap.get(vote.userId);
					if (!voteList) {
						voteList = [];
						userMap.set(vote.userId, voteList);
					}
					voteList.push(vote);
					return noteMap;
				}, new Map<string, Map<string, MiPollVote[]>>)),
			// channels
			this.getChannels(targetNotes),
			// mutedThreads
			me ? this.cacheService.threadMutingsCache.fetch(me.id) : new Set<string>(),
			// mutedNotes
			me ? this.cacheService.noteMutingsCache.fetch(me.id) : new Set<string>(),
			// favoriteNotes
			me ? this.noteFavoritesRepository
				.createQueryBuilder('favorite')
				.select('favorite.noteId', 'noteId')
				.where({ userId: me.id, noteId: In(noteIds) })
				.getRawMany<{ noteId: string }>()
				.then(fs => new Set(fs.map(f => f.noteId))) : new Set<string>(),
			// renotedNotes
			me ? this.queryService
				.andIsRenote(this.notesRepository.createQueryBuilder('note'), 'note')
				.andWhere({ userId: me.id, renoteId: In(noteIds) })
				.select('note.renoteId', 'renoteId')
				.getRawMany<{ renoteId: string }>()
				.then(ns => new Set(ns.map(n => n.renoteId))) : new Set<string>(),
			// (not returned)
			this.customEmojiService.prefetchEmojis(this.aggregateNoteEmojis(notes)),
		]);

		return await Promise.all(notes.map(n => this.pack(n, me, {
			...options,
			_hint_: {
				bufferedReactions,
				myReactions: myReactionsMap,
				packedFiles,
				packedUsers,
				mentionHandles,
				userFollowings,
				userBlockers,
				polls,
				pollVotes,
				channels,
				notes: new Map(targetNotes.map(n => [n.id, n])),
				mutedThreads,
				mutedNotes,
				favoriteNotes,
				renotedNotes,
			},
		})));
	}

	// TODO find a way to de-duplicate pack() calls when we have multiple references to the same note.

	private async fetchRequiredNotes(notes: MiNote[], detail: boolean): Promise<MiNote[]> {
		const notesMap = new Map<string, MiNote>();
		const notesToFetch = new Set<string>();

		function addNote(note: string | MiNote | null | undefined) {
			if (note == null) return;

			if (typeof(note) === 'object') {
				notesMap.set(note.id, note);
				notesToFetch.delete(note.id);
			} else if (detail) {
				if (!notesMap.has(note)) {
					notesToFetch.add(note);
				}
			}
		}

		// Enumerate 1st-tier dependencies
		for (const note of notes) {
			// Add note itself
			addNote(note);

			// Add renote
			if (note.renoteId) {
				if (note.renote) {
					addNote(note.renote);
					addNote(note.renote.reply ?? note.renote.replyId);
					addNote(note.renote.renote ?? note.renote.renoteId);
				} else {
					addNote(note.renoteId);
				}
			}

			// Add reply
			addNote(note.reply ?? note.replyId);
		}

		// Populate 1st-tier dependencies
		if (notesToFetch.size > 0) {
			const newNotes = await this.notesRepository.find({
				where: {
					id: In(Array.from(notesToFetch)),
				},
				relations: {
					reply: true,
					renote: {
						reply: true,
						renote: true,
					},
					channel: true,
				},
			});

			for (const note of newNotes) {
				addNote(note);
			}

			notesToFetch.clear();
		}

		// Extract second-tier dependencies
		for (const note of Array.from(notesMap.values())) {
			if (isPureRenote(note) && note.renote) {
				if (note.renote.reply && !notesMap.has(note.renote.reply.id)) {
					notesMap.set(note.renote.reply.id, note.renote.reply);
				}

				if (note.renote.renote && !notesMap.has(note.renote.renote.id)) {
					notesMap.set(note.renote.renote.id, note.renote.renote);
				}
			}
		}

		return Array.from(notesMap.values());
	}

	@bindThis
	public aggregateNoteEmojis(notes: MiNote[]) {
		let emojis: { name: string | null; host: string | null; }[] = [];
		for (const note of notes) {
			emojis = emojis.concat(note.emojis
				.map(e => this.customEmojiService.parseEmojiStr(e, note.userHost)));
			if (note.renote) {
				emojis = emojis.concat(note.renote.emojis
					.map(e => this.customEmojiService.parseEmojiStr(e, note.renote!.userHost)));
				if (note.renote.user) {
					emojis = emojis.concat(note.renote.user.emojis
						.map(e => this.customEmojiService.parseEmojiStr(e, note.renote!.userHost)));
				}
			}
			const customReactions = Object.keys(note.reactions).map(x => this.reactionService.decodeReaction(x)).filter(x => x.name != null) as typeof emojis;
			emojis = emojis.concat(customReactions);
			if (note.user) {
				emojis = emojis.concat(note.user.emojis
					.map(e => this.customEmojiService.parseEmojiStr(e, note.userHost)));
			}
		}
		return emojis.filter(x => x.name != null && x.host != null) as { name: string; host: string; }[];
	}

	@bindThis
	private findNoteOrFail(id: string): Promise<MiNote> {
		return this.notesRepository.findOneOrFail({
			where: { id },
			relations: ['user'],
		});
	}

	private async getUserHandles(userIds: string[], hint?: Record<string, string | undefined>): Promise<Record<string, string | undefined>> {
		if (userIds.length < 1) return {};

		// Hint is provided by packMany to avoid N+1 queries.
		// It should already include all existing mentioned users.
		if (hint) {
			const handles = {} as Record<string, string | undefined>;
			for (const id of userIds) {
				handles[id] = hint[id];
			}
			return handles;
		}

		const users = await this.usersRepository.find({
			select: {
				id: true,
				username: true,
				host: true,
			},
			where: {
				id: In(userIds),
			},
		});

		return users.reduce((map, user) => {
			map[user.id] = user.host
				? `@${user.username}@${user.host}`
				: `@${user.username}`;
			return map;
		}, {} as Record<string, string | undefined>);
	}

	private async getChannels(notes: MiNote[]): Promise<Map<string, MiChannel>> {
		const channels = new Map<string, MiChannel>();
		const channelsToFetch = new Set<string>();

		for (const note of notes) {
			if (note.channel) {
				channels.set(note.channel.id, note.channel);
			} else if (note.channelId) {
				channelsToFetch.add(note.channelId);
			}
		}

		if (channelsToFetch.size > 0) {
			const newChannels = await this.channelsRepository.findBy({
				id: In(Array.from(channelsToFetch)),
			});
			for (const channel of newChannels) {
				channels.set(channel.id, channel);
			}
		}

		return channels;
	}

	private async getReactions(notes: MiNote[], me: { id: string } | null | undefined) {
		const bufferedReactions = this.meta.enableReactionsBuffering ? await this.reactionsBufferingService.getMany([...getAppearNoteIds(notes)]) : null;

		const meId = me ? me.id : null;
		const myReactionsMap = new Map<MiNote['id'], string | null>();
		if (meId) {
			const idsNeedFetchMyReaction = new Set<MiNote['id']>();

			for (const note of notes) {
				const reactionsCount = Object.values(this.reactionsBufferingService.mergeReactions(note.reactions, bufferedReactions?.get(note.id)?.deltas ?? {})).reduce((a, b) => a + b, 0);
				if (reactionsCount === 0) {
					myReactionsMap.set(note.id, null);
				} else if (reactionsCount <= note.reactionAndUserPairCache.length + (bufferedReactions?.get(note.id)?.pairs.length ?? 0)) {
					const pairInBuffer = bufferedReactions?.get(note.id)?.pairs.find(p => p[0] === meId);
					if (pairInBuffer) {
						myReactionsMap.set(note.id, pairInBuffer[1]);
					} else {
						const pair = note.reactionAndUserPairCache.find(p => p.startsWith(meId));
						myReactionsMap.set(note.id, pair ? pair.split('/')[1] : null);
					}
				} else {
					idsNeedFetchMyReaction.add(note.id);
				}
			}

			const myReactions = idsNeedFetchMyReaction.size > 0 ? await this.noteReactionsRepository.findBy({
				userId: meId,
				noteId: In(Array.from(idsNeedFetchMyReaction)),
			}) : [];

			for (const id of idsNeedFetchMyReaction) {
				myReactionsMap.set(id, myReactions.find(reaction => reaction.noteId === id)?.reaction ?? null);
			}
		}

		return { bufferedReactions, myReactionsMap };
	}

	@bindThis
	public genLocalNoteUri(noteId: string): string {
		return `${this.config.url}/notes/${noteId}`;
	}
}
