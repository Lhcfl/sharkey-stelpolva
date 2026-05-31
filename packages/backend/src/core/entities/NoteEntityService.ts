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
import type { UsersRepository, NotesRepository, FollowingsRepository, PollsRepository, PollVotesRepository, NoteReactionsRepository, ChannelsRepository, MiMeta, MiPollVote, MiPoll, MiChannel, NoteFavoritesRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { IsOne } from '@/misc/is-one.js';
import { deepClone } from '@/misc/clone.js';
import { crawlNote } from '@/misc/crawl-note.js';
import { Deduplicator } from '@/misc/deduplicator.js';
import { DebounceLoader } from '@/misc/loader.js';
import { QueryService } from '@/core/QueryService.js';
import { TimeService } from '@/global/TimeService.js';
import { RoleService } from '@/core/RoleService.js';
import { NoteVisibilityService } from '@/core/NoteVisibilityService.js';
import { IdService } from '@/core/IdService.js';
import type { ReactionsBufferingService } from '@/core/ReactionsBufferingService.js';
import type { Config } from '@/config.js';
import type { NoteVisibilityData, PopulatedMe, PopulatedNote, NoteVisibilityHint } from '@/core/NoteVisibilityService.js';
import type { OnModuleInit } from '@nestjs/common';
import type { CacheService, UserRelation } from '../CacheService.js';
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
	private noteLoader = new DebounceLoader(this.findNoteOrFail);
	private channelLoader = new DebounceLoader(this.findChannelOrFail);

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
		private readonly timeService: TimeService,
		private readonly roleService: RoleService,
		private readonly idService: IdService,
	) {
	}

	@bindThis
	public onModuleInit() {
		this.userEntityService = this.moduleRef.get('UserEntityService');
		this.driveFileEntityService = this.moduleRef.get('DriveFileEntityService');
		this.cacheService = this.moduleRef.get('CacheService');
		this.customEmojiService = this.moduleRef.get('CustomEmojiService');
		this.reactionService = this.moduleRef.get('ReactionService');
		this.reactionsBufferingService = this.moduleRef.get('ReactionsBufferingService');
	}

	// Implementation moved to NoteVisibilityService
	/*
	@bindThis
	private treatVisibility(packedNote: Packed<'Note'>): Packed<'Note'>['visibility'] {
		if (packedNote.visibility === 'public' || packedNote.visibility === 'home') {
			const followersOnlyBefore = packedNote.user.makeNotesFollowersOnlyBefore;
			if ((followersOnlyBefore != null)
				&& (
					(followersOnlyBefore <= 0 && (this.timeService.now - new Date(packedNote.createdAt).getTime() > 0 - (followersOnlyBefore * 1000)))
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
	public async hideNotesAsync(notes: Packed<'Note'>[], meOrMeId: MiUser | MiUser['id'] | null, hint?: NoteVisibilityHint): Promise<void> {
		const me = typeof(meOrMeId) === 'string'
			? await this.cacheService.findUserById(meOrMeId)
			: meOrMeId;
		const data = await this.noteVisibilityService.populate(notes, me, hint);

		for (const packedNote of notes) {
			const populatedNote = data.populatedNotes.find(n => n.id === packedNote.id);
			if (populatedNote) {
				this.hideNote(packedNote, populatedNote, me, data.populatedData);
			}
		}
	}

	@bindThis
	public async hideNoteAsync(packedNote: Packed<'Note'>, me: string | Pick<MiUser, 'id' | 'host'> | null, hint?: NoteVisibilityHint): Promise<void> {
		const { redact, reason } = await this.noteVisibilityService.checkNoteVisibilityAsync(packedNote, me, { hint });

		if (redact) {
			this.redactNoteContents(packedNote, reason);
		}
	}

	@bindThis
	public hideNote(packedNote: Packed<'Note'>, populatedNote: PopulatedNote, me: PopulatedMe, data: NoteVisibilityData): void {
		const { redact, reason } = this.noteVisibilityService.checkNoteVisibility(populatedNote, me, { data });

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
	private async populateMyRenotes(notes: Packed<'Note'>[], meId: string, hint?: {
		myRecentRenotes?: ReadonlySet<string>;
	}): Promise<Set<string>> {
		const renotes = new Set<string>();
		const renotesToFetch = new Set<string>(notes.map(n => n.id));

		// Fetch renotes from hint
		if (hint?.myRecentRenotes) {
			for (const noteId of hint.myRecentRenotes) {
				if (renotesToFetch.delete(noteId)) {
					renotes.add(noteId);
				}
			}
		}

		// Fetch renotes from DB
		if (renotesToFetch.size > 0) {
			const fetched = await this.queryService
				.andIsRenote(this.notesRepository.createQueryBuilder('note'), 'note')
				.andWhere({
					userId: meId,
					renoteId: IsOne(Array.from(renotesToFetch)),
				})
				.select('note.renoteId', 'renoteId')
				.getRawMany<{ renoteId: string }>();

			for (const { renoteId } of fetched) {
				renotes.add(renoteId);
			}
		}

		return renotes;
	}

	@bindThis
	private async populateMyFavorites(notes: Packed<'Note'>[], meId: string, hint?: {
		myRecentFavorites?: ReadonlySet<string>;
	}): Promise<Set<string>> {
		const favorites = new Set<string>();
		const favoritesToFetch = new Set<string>(notes.map(n => n.id));

		// Fetch favorites from hint
		if (hint?.myRecentFavorites) {
			for (const noteId of hint.myRecentFavorites) {
				if (favoritesToFetch.delete(noteId)) {
					favorites.add(noteId);
				}
			}
		}

		// Fetch favorites from DB
		if (favoritesToFetch.size > 0) {
			const fetched = await this.noteFavoritesRepository.find({
				where: {
					userId: meId,
					noteId: IsOne(Array.from(favoritesToFetch)),
				},
				select: {
					noteId: true,
				},
			}) as { noteId: string }[];

			for (const { noteId } of fetched) {
				favorites.add(noteId);
			}
		}

		return favorites;
	}

	@bindThis
	private async populateMyReactions(notes: Packed<'Note'>[], meId: string, hint?: {
		myRecentReactions?: ReadonlyMap<MiNote['id'], string>;
	}): Promise<Map<string, string>> {
		const reactions = new Map<string, string>();
		const reactionsToFetch = new Set<string>(notes.map(n => n.id));

		// Fetch reactions from hint
		if (hint?.myRecentReactions) {
			for (const [noteId, rawReaction] of hint.myRecentReactions) {
				if (reactionsToFetch.delete(noteId)) {
					const convertedReaction = this.reactionService.convertLegacyReaction(rawReaction);
					reactions.set(noteId, convertedReaction);
				}
			}
		}

		// Fetch reactions from DB
		if (reactionsToFetch.size > 0) {
			const fetched = await this.noteReactionsRepository.find({
				where: {
					userId: meId,
					noteId: IsOne(Array.from(reactionsToFetch)),
				},
				select: {
					noteId: true,
					reaction: true,
				},
			});

			for (const { noteId, reaction } of fetched) {
				const convertedReaction = this.reactionService.convertLegacyReaction(reaction);
				reactions.set(noteId, convertedReaction);
			}
		}

		return reactions;
	}

	@bindThis
	public async populateMyReaction(note: { id: MiNote['id']; reactions: MiNote['reactions']; reactionAndUserPairCache?: MiNote['reactionAndUserPairCache']; }, meId: MiUser['id'], _hint_?: {
		myReactions?: Map<MiNote['id'], string | null>;
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
		if (this.idService.parse(note.id).date.getTime() + 2000 > this.timeService.now) {
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
		const missingIds: string[] = [];
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

	/**
	 * Takes an anonymous packed note (called with "me" set to null or undefined) and "re-packs" it in the context of a given user.
	 * @param note Anonymous packed note
	 * @param me User to re-pack for
	 * @param hint Optional hint data - pass optimistically to speed up calls
	 */
	@bindThis
	public async rePack(note: Packed<'Note'>, me: MiUser | MiUser['id'], hint?: {
		myRecentReactions?: ReadonlyMap<MiNote['id'], string>;
		myRecentRenotes?: ReadonlySet<string>;
		myRecentFavorites?: ReadonlySet<string>;
		myInstanceMutings?: ReadonlySet<string>;
		myNoteMutings?: ReadonlySet<string>;
		myThreadMutings?: ReadonlySet<string>;
	}): Promise<Packed<'Note'>> {
		const meId = typeof(me) === 'object' ? me.id : me;

		// Important: copy the note, since anonymous packed notes are often shared between multiple users!
		const clonedNote = deepClone(note);
		const allNotes = crawlNote(clonedNote);
		const allUsers = new Set(allNotes.map(note => note.userId)).values().toArray();

		const [myReactions, myRenotes, myFavorites, myInstanceMutings, myThreadMutings, myNoteMutings, myRelations] = await Promise.all([
			this.populateMyReactions(allNotes, meId, hint),
			this.populateMyRenotes(allNotes, meId, hint),
			this.populateMyFavorites(allNotes, meId, hint),
			hint?.myInstanceMutings ?? this.cacheService.userProfileCache.fetch(meId)
				.then(profile => new Set(profile.mutedInstances)),
			hint?.myThreadMutings ?? this.cacheService.threadMutingsCache.fetch(meId),
			hint?.myNoteMutings ?? this.cacheService.noteMutingsCache.fetch(meId),
			this.cacheService.getUserRelations(meId, allUsers),
		]);

		for (const n of allNotes) {
			// Sync visibility in case there's something like "makeNotesFollowersOnlyBefore" enabled
			this.noteVisibilityService.syncVisibility(n);

			n.myReaction = myReactions.get(n.id) ?? null;
			n.isRenoted = myRenotes.has(n.id);
			n.isFavorited = myFavorites.has(n.id);
			n.isMutingThread = myThreadMutings.has(n.id);
			n.isMutingNote = myNoteMutings.has(n.id);
			n.user.bypassSilence = n.userId === meId || !!myRelations.get(n.userId)?.isFollowing;
		}

		// Hide notes *after* we sync visibility
		await this.hideNotesAsync(allNotes, me, {
			userRelations: myRelations,
			userMutedInstances: myInstanceMutings,
			userMutedNotes: myNoteMutings,
			userMutedThreads: myThreadMutings,
		});

		return clonedNote;
	}

	@bindThis
	public async pack(
		src: MiNote['id'] | MiNote,
		me?: { id: MiUser['id'] } | null | undefined,
		options?: {
			detail?: boolean;
			recurseReply?: boolean; // Defaults to the value of detail, which defaults to true.
			recurseRenote?: boolean; // Defaults to the value of detail, which defaults to true.
			skipHide?: boolean;
			withReactionAndUserPairCache?: boolean;
			bypassSilence?: boolean;
			noteFetcher?: Deduplicator<MiNote>;
			channelFetcher?: Deduplicator<MiChannel>;
			_hint_?: {
				bufferedReactions?: Map<MiNote['id'], { deltas: Record<string, number>; pairs: ([MiUser['id'], string])[] }> | null;
				myReactions?: Map<MiNote['id'], string | null>;
				packedFiles?: Map<MiNote['fileIds'][number], Packed<'DriveFile'> | null>;
				packedUsers?: Map<MiUser['id'], Packed<'UserLite'>>;
				polls?: Map<string, MiPoll>;
				pollVotes?: Map<string, Map<string, MiPollVote[]>>;
				channels?: Map<string, MiChannel>;
				notes?: Map<string, MiNote>;
				mutedThreads?: Set<string>;
				mutedNotes?: Set<string>;
				userRelation?: UserRelation;
				userRelations?: Map<string, UserRelation>;
				favoriteNotes?: Set<string>;
				renotedNotes?: Set<string>;
				iAmAdmin?: boolean;
				iAmModerator?: boolean;
			};
		},
	): Promise<Packed<'Note'>> {
		const opts = Object.assign({
			detail: true,
			skipHide: false,
			withReactionAndUserPairCache: false,
		}, options);
		opts.recurseRenote ??= opts.detail;
		opts.recurseReply ??= opts.detail;

		const channelFetcher = opts.channelFetcher?.fetch ?? this.channelLoader.load;
		const noteFetcher = opts.noteFetcher?.fetch ?? this.noteLoader.load;

		const meId = me ? me.id : null;
		const note = typeof src === 'object' ? src : await noteFetcher(src);
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
			? (opts._hint_?.channels?.get(note.channelId) ?? note.channel ?? await channelFetcher(note.channelId))
			: null;

		const reactionEmojiNames = Object.keys(reactions)
			.filter(x => x.startsWith(':') && x.includes('@') && !x.includes('@.')) // リモートカスタム絵文字のみ
			.map(x => this.reactionService.decodeReaction(x).reaction.replaceAll(':', ''));
		const packedFiles = options?._hint_?.packedFiles;
		const packedUsers = options?._hint_?.packedUsers;

		const threadId = note.threadId ?? note.id;
		const [mutedThreads, mutedNotes, isFavorited, isRenoted, userRelation] = await Promise.all([
			// mutedThreads
			opts._hint_?.mutedThreads
				?? (meId ? this.cacheService.threadMutingsCache.fetch(meId) : new Set<string>()),
			// mutedNotes
			opts._hint_?.mutedNotes
				?? (meId ? this.cacheService.noteMutingsCache.fetch(meId) : new Set<string>),
			// isFavorited
			opts._hint_?.favoriteNotes?.has(note.id)
				?? (meId ? this.noteFavoritesRepository.existsBy({ userId: meId, noteId: note.id }) : false),
			// isRenoted
			opts._hint_?.renotedNotes?.has(note.id)
				?? (meId ? this.queryService
					.andIsRenote(this.notesRepository.createQueryBuilder('note'), 'note')
					.andWhere({ renoteId: note.id, userId: meId })
					.getExists() : false),
			// userRelation
			opts._hint_?.userRelation
				?? opts._hint_?.userRelations?.get(note.userId)
				?? (meId ? this.cacheService.getUserRelation(meId, note.userId) : undefined),
		]);

		const bypassSilence = opts.bypassSilence || note.userId === meId;

		const iAmAdmin = me ? (opts._hint_?.iAmAdmin ?? await this.roleService.isAdministrator(me)) : false;
		const iAmModerator = me ? (opts._hint_?.iAmModerator ?? (iAmAdmin || await this.roleService.isModerator(me))) : false;

		// Hint for nested note pack
		const subHint: typeof opts['_hint_'] = {
			...(opts._hint_ ?? {}),
			mutedThreads,
			mutedNotes,
			iAmAdmin,
			iAmModerator,
		};

		// noinspection ES6MissingAwait
		const packed: Packed<'Note'> = await awaitAll({
			id: note.id,
			threadId,
			createdAt: this.idService.parse(note.id).date.toISOString(),
			updatedAt: note.updatedAt ? note.updatedAt.toISOString() : undefined,
			userId: note.userId,
			userHost: note.userHost,
			user: packedUsers?.get(note.userId) ?? this.userEntityService.pack(note.user ?? note.userId, me, { hint: { userRelation, iAmAdmin, iAmModerator } }),
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
			uri: note.uri ?? undefined,
			url: note.url ?? undefined,
			poll: note.hasPoll ? this.populatePoll(note, meId, {
				poll: opts._hint_?.polls?.get(note.id),
				myVotes: opts._hint_?.pollVotes?.get(note.id)?.get(note.userId),
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
			} : {}),

			reply: opts.recurseReply && note.replyId ? this.pack(note.reply ?? opts._hint_?.notes?.get(note.replyId) ?? note.replyId, me, {
				detail: false,
				skipHide: opts.skipHide,
				withReactionAndUserPairCache: opts.withReactionAndUserPairCache,
				noteFetcher: opts.noteFetcher,
				channelFetcher: opts.channelFetcher,
				_hint_: subHint,

				// Don't silence target of self-reply, since the outer note will already be silenced.
				bypassSilence: bypassSilence || note.userId === note.replyUserId,
			}) : undefined,

			// The renote target needs to be packed with the reply, but we *must not* recurse any further.
			// Pass detail=false and recurseReply=true to make sure we only include the right data.
			renote: opts.recurseRenote && note.renoteId ? this.pack(note.renote ?? opts._hint_?.notes?.get(note.renoteId) ?? note.renoteId, me, {
				detail: false,
				recurseReply: true,
				skipHide: opts.skipHide,
				withReactionAndUserPairCache: opts.withReactionAndUserPairCache,
				noteFetcher: opts.noteFetcher,
				channelFetcher: opts.channelFetcher,
				_hint_: subHint,

				// Don't silence target of self-renote, since the outer note will already be silenced.
				bypassSilence: bypassSilence || note.userId === note.renoteUserId,
			}) : undefined,
		});

		this.noteVisibilityService.syncVisibility(packed);

		if (!opts.skipHide) {
			await this.hideNoteAsync(packed, meId, {
				userMutedNotes: opts._hint_?.mutedNotes,
				userMutedThreads: opts._hint_?.mutedThreads,
				userRelations: opts._hint_?.userRelations,
				userRelation,
				iAmModerator,
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
			hint?: {
				userRelations?: Map<string, UserRelation>;
				iAmAdmin?: boolean;
				iAmModerator?: boolean;
			}
		},
	) {
		if (notes.length === 0) return [];

		// Create session deduplicators
		const noteFetcher = new Deduplicator(noteId => this.noteLoader.load(noteId));
		const channelFetcher = new Deduplicator(channelId => this.channelLoader.load(channelId));

		const targetNotes = await this.fetchRequiredNotes(notes, options?.detail ?? false);
		const noteIds = Array.from(new Set(targetNotes.keys()));

		const usersMap = new Map<string, MiUser | string>();
		const allUsers = targetNotes.values().flatMap(note => [
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

		const fileIds = new Set(targetNotes.values().flatMap(n => n.fileIds));

		// These are pulled out so we can reference it twice within the same awaitAll() call
		const userRelationsPromise = Promise.resolve(me
			? this.cacheService.getUserRelations(me, userIds, { userRelations: options?.hint?.userRelations })
			: new Map<string, UserRelation>());
		const iAmAdminPromise = Promise.resolve(me
			? (options?.hint?.iAmAdmin ?? this.roleService.isAdministrator(me))
			: false);
		const iAmModeratorPromise = iAmAdminPromise.then(iAmAdmin => me
			? (options?.hint?.iAmModerator ?? (iAmAdmin || this.roleService.isModerator(me)))
			: false);

		const [{ bufferedReactions, myReactionsMap }, packedFiles, packedUsers, polls, pollVotes, channels, mutedThreads, mutedNotes, favoriteNotes, renotedNotes, userRelations, iAmAdmin, iAmModerator] = await Promise.all([
			// bufferedReactions & myReactionsMap
			this.getReactions(targetNotes.values().toArray(), me),
			// packedFiles
			this.driveFileEntityService.packManyByIdsMap(Array.from(fileIds)),
			// packedUsers
			Promise.all([userRelationsPromise, iAmAdminPromise, iAmModeratorPromise])
				.then(([userRelations, iAmAdmin, iAmModerator]) => this.userEntityService.packMany(users, me, { hint: { userRelations, iAmAdmin, iAmModerator } }))
				.then(packedUsers => new Map(packedUsers.map(u => [u.id, u]))),
			// polls
			this.pollsRepository.findBy({ noteId: IsOne(noteIds) })
				.then(polls => new Map(polls.map(p => [p.noteId, p]))),
			// pollVotes
			this.pollVotesRepository.findBy({ noteId: IsOne(noteIds), userId: IsOne(userIds) })
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
			this.getChannels(targetNotes.values()),
			// mutedThreads
			me ? this.cacheService.threadMutingsCache.fetch(me.id) : new Set<string>(),
			// mutedNotes
			me ? this.cacheService.noteMutingsCache.fetch(me.id) : new Set<string>(),
			// favoriteNotes
			me ? this.noteFavoritesRepository
				.createQueryBuilder('favorite')
				.select('favorite.noteId', 'noteId')
				.where({ userId: me.id, noteId: IsOne(noteIds) })
				.getRawMany<{ noteId: string }>()
				.then(fs => new Set(fs.map(f => f.noteId))) : new Set<string>(),
			// renotedNotes
			me ? this.queryService
				.andIsRenote(this.notesRepository.createQueryBuilder('note'), 'note')
				.andWhere({ userId: me.id, renoteId: IsOne(noteIds) })
				.select('note.renoteId', 'renoteId')
				.getRawMany<{ renoteId: string }>()
				.then(ns => new Set(ns.map(n => n.renoteId))) : new Set<string>(),
			// userRelations
			userRelationsPromise,
			// iAmAdmin
			iAmAdminPromise,
			// iAmModerator
			iAmModeratorPromise,
			// (not returned)
			this.customEmojiService.prefetchEmojis(this.aggregateNoteEmojis(notes)),
		]);

		return await Promise.all(notes.map(n => this.pack(n, me, {
			...options,
			noteFetcher,
			channelFetcher,
			_hint_: {
				bufferedReactions,
				myReactions: myReactionsMap,
				packedFiles,
				packedUsers,
				polls,
				pollVotes,
				channels,
				notes: targetNotes,
				mutedThreads,
				mutedNotes,
				favoriteNotes,
				renotedNotes,
				userRelations,
				iAmAdmin,
				iAmModerator,
			},
		})));
	}

	// TODO find a way to de-duplicate pack() calls when we have multiple references to the same note.

	private async fetchRequiredNotes(notes: MiNote[], detail: boolean): Promise<Map<string, MiNote>> {
		const notesMap = new Map<string, MiNote>();
		const notesToFetch = new Set<string>();
		const notesToRecurse = new Set<string>();

		function addNote(note: string | MiNote | null | undefined, forceDetail = false) {
			if (!note) return;

			const noteId = typeof(note) === 'object' ? note.id : note;
			if (notesMap.has(noteId)) return;

			if (typeof(note) === 'object') {
				notesMap.set(noteId, note);
				notesToFetch.delete(noteId);
			} else if (detail || forceDetail) {
				notesToFetch.add(noteId);
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

				if (isPureRenote(note)) {
					notesToRecurse.add(note.renoteId);
				}
			}

			// Add reply
			addNote(note.reply ?? note.replyId);
		}

		// Populate 1st-tier dependencies
		if (notesToFetch.size > 0) {
			const newNotes = await this.notesRepository.find({
				where: {
					id: IsOne(Array.from(notesToFetch)),
				},
			});

			for (const note of newNotes) {
				addNote(note);
			}
		}

		// Reset state for phase transition
		notesToFetch.clear();

		// Enumerate 2nd-tier dependencies (boost->quote->reply and boost->quote->renote)
		for (const noteId of notesToRecurse) {
			const maybeQuote = notesMap.get(noteId);
			if (maybeQuote) {
				addNote(maybeQuote.renote ?? maybeQuote.renoteId, true);
				addNote(maybeQuote.reply ?? maybeQuote.replyId, true);
			}
		}

		// Populate 2nd-tier dependencies
		if (notesToFetch.size > 0) {
			const newNotes = await this.notesRepository.find({
				where: {
					id: IsOne(Array.from(notesToFetch)),
				},
			});

			for (const note of newNotes) {
				addNote(note);
			}
		}

		return notesMap;
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
		return this.notesRepository.findOneByOrFail({ id });
	}

	@bindThis
	private findChannelOrFail(id: string): Promise<MiChannel> {
		return this.channelsRepository.findOneByOrFail({ id });
	}

	private async getChannels(notes: Iterable<MiNote>): Promise<Map<string, MiChannel>> {
		const channels = new Map<string, MiChannel>();
		const channelsToFetch = new Set<string>();

		for (const note of notes) {
			if (!note.channelId) continue;
			if (channels.has(note.channelId)) continue;

			if (note.channel) {
				channels.set(note.channel.id, note.channel);
				channelsToFetch.delete(note.channel.id);
			} else {
				channelsToFetch.add(note.channelId);
			}
		}

		if (channelsToFetch.size > 0) {
			const newChannels = await this.channelsRepository.findBy({
				id: IsOne(Array.from(channelsToFetch)),
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
				noteId: IsOne(Array.from(idsNeedFetchMyReaction)),
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
