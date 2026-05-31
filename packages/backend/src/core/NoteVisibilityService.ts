/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserListMembership } from '@/models/UserListMembership.js';
import type { NotesRepository } from '@/models/_.js';
import type { Packed } from '@/misc/json-schema.js';
import { CacheService, UserRelation } from '@/core/CacheService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { RoleService } from '@/core/RoleService.js';
import { IdService } from '@/core/IdService.js';
import { TimeService } from '@/global/TimeService.js';
import { bindThis } from '@/decorators.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import { toArray } from '@/misc/prelude/array.js';
import { IsOne } from '@/misc/is-one.js';
import { DI } from '@/di-symbols.js';

/**
 * Visibility level for a given user towards a given post.
 */
export interface NoteVisibilityResult {
	/**
	 * Whether the user has access to view this post.
	 */
	accessible: boolean;

	/**
	 * If the user should be shown only a redacted version of the post.
	 * (see NoteEntityService.hideNote() for details.)
	 */
	redact: boolean;

	/**
	 * If false, the note should be visible by default. (normal case)
	 * If true, the note should be hidden by default. (Silences, mutes, etc.)
	 * If "timeline", the note should be hidden in timelines only. (following w/o replies)
	 */
	silence: boolean;

	/**
	 * If redact is true, the reason why it was redacted.
	 */
	reason?: string;
}

export interface NoteVisibilityFilters {
	/**
	 * If false, exclude replies to other users unless the "include replies to others in timeline" has been enabled for the note's author.
	 * If true (default), then replies are treated like any other post.
	 */
	includeReplies?: boolean;

	/**
	 * If true, treat the note's author as never being silenced. Does not apply to reply or renote targets, unless they're by the same author.
	 * If false (default), then silence is enforced for all notes.
	 */
	includeSilencedAuthor?: boolean;

	/**
	 * Set to an ID to apply visibility from the context of a specific user list.
	 * Membership and "with replies" settings will be adopted from this list.
	 */
	listContext?: string | null;
}

@Injectable()
export class NoteVisibilityService {
	constructor(
		@Inject(DI.notesRepository)
		private readonly notesRepository: NotesRepository,

		private readonly cacheService: CacheService,
		private readonly idService: IdService,
		private readonly timeService: TimeService,
		private readonly utilityService: UtilityService,
		private readonly roleService: RoleService,
	) {}

	// TODO redis cache for this?
	@bindThis
	public async checkNoteVisibilityAsync(note: MiNote | Packed<'Note'>, user: string | PopulatedMe, opts?: { filters?: NoteVisibilityFilters, hint?: NoteVisibilityHint }): Promise<NoteVisibilityResult> {
		if (typeof(user) === 'string') {
			user = await this.cacheService.findUserById(user);
		}

		const { populatedNotes, populatedData } = await this.populate(note, user, opts?.hint);
		const populatedNote = populatedNotes[0];

		return this.checkNoteVisibility(populatedNote, user, { filters: opts?.filters, data: populatedData });
	}

	@bindThis
	public async populate(noteOrNotes: MiNote | Packed<'Note'> | (MiNote | Packed<'Note'>)[], accessingUser: PopulatedMe, hint?: NoteVisibilityHint): Promise<PopulationData> {
		// Fetch all notes up-front
		const noteInput = toArray(noteOrNotes).flatMap(note => [
			note,
			note.replyId ? (note.reply ?? hint?.notes?.get(note.replyId) ?? note.replyId) : undefined,
			note.renoteId ? (note.renote ?? hint?.notes?.get(note.renoteId) ?? note.renoteId) : undefined,
			note.renote?.replyId ? (note.renote.reply ?? hint?.notes?.get(note.renote.replyId) ?? note.renote.replyId) : undefined,
			// TODO above optimization fails if input contains many quotes without deep note->renote->reply relations.
			//  This isn't ideal, but it's not a critical issue since the population code will fetch on-demand.
		]);
		const notes = new Map<string, MiNote | Packed<'Note'>>();
		const notesToFetch = new Set<string>();
		for (const note of noteInput) {
			if (!note) {
				continue;
			}

			const noteId = typeof(note) === 'object' ? note.id : note;
			if (notes.has(noteId)) {
				continue;
			}

			if (typeof(note) === 'object') {
				notes.set(noteId, note);
				notesToFetch.delete(noteId);
			} else {
				notesToFetch.add(noteId);
			}
		}
		if (notesToFetch.size > 0) {
			const fetchedNotes = await this.notesRepository.findBy({
				id: IsOne(notesToFetch.values().toArray()),
			});
			for (const note of fetchedNotes) {
				notes.set(note.id, note);
			}
		}
		const notesList = notes.values().toArray();

		// Fetch all users up-front
		const userInput = notesList.map(note => {
			// No need to recurse, since notes() is already fully-expanded.
			return note.user ?? hint?.users?.get(note.userId) ?? note.userId;
		});
		const users = new Map<string, MiUser>();
		const usersToFetch = new Set<string>();
		for (const user of userInput) {
			const userId = typeof(user) === 'object' ? user.id : user;
			if (users.has(userId)) {
				continue;
			}

			// Property check filters out PackedUserLite
			if (typeof(user) === 'object' && ('isSuspended' in user)) {
				users.set(userId, user);
				usersToFetch.delete(userId);
			} else {
				usersToFetch.add(userId);
			}
		}
		if (usersToFetch.size > 0) {
			const fetchedUsers = await this.cacheService.findUsersById(usersToFetch);
			for (const [id, user] of fetchedUsers) {
				users.set(id, user);
			}
		}
		const usersList = users.values().toArray();

		// Populate all notes
		const noteHint = { notes, users };
		const populatedNotes = await Promise.all(toArray(noteOrNotes).map(note => this.populateNote(note, noteHint)));

		// Populate other data
		const dataHint = { ...(hint ?? {}), ...noteHint };
		const populatedData = await this.populateData(accessingUser, usersList, dataHint);

		return { populatedNotes, populatedData };
	}

	@bindThis
	private async populateNote(note: MiNote | Packed<'Note'>, hint?: NotePopulationHint, diveReply = true, diveRenote = true): Promise<PopulatedNote> {
		const userPromise = this.getNoteUser(note, hint);

		// noinspection ES6MissingAwait
		return await awaitAll({
			id: note.id,
			threadId: note.threadId ?? note.id,
			createdAt: 'createdAt' in note
				? new Date(note.createdAt)
				: this.idService.parse(note.id).date,
			userId: note.userId,
			userHost: userPromise.then(u => u.host),
			user: userPromise,
			renoteId: note.renoteId ?? null,
			renote: diveRenote ? this.getNoteRenote(note, hint) : null,
			replyId: note.replyId ?? null,
			reply: diveReply ? this.getNoteReply(note, hint) : null,
			hasPoll: 'hasPoll' in note ? note.hasPoll : (note.poll != null),
			mentions: note.mentions ?? [],
			visibleUserIds: note.visibleUserIds ?? [],
			visibility: note.visibility,
			text: note.text,
			cw: note.cw ?? null,
			fileIds: note.fileIds ?? [],
		});
	}

	private async getNoteUser(note: MiNote | Packed<'Note'>, hint?: NotePopulationHint): Promise<PopulatedUser> {
		// Property check filters out PackedUserLite
		const noteMiUser = (note.user && 'isSuspended' in note.user) ? note.user : null;
		return noteMiUser ?? hint?.users?.get(note.userId) ?? await this.cacheService.findUserById(note.userId);
	}

	private async getNoteRenote(note: MiNote | Packed<'Note'>, hint?: NotePopulationHint): Promise<PopulatedNote | null> {
		if (!note.renoteId) return null;

		const renote = note.renote
			?? hint?.notes?.get(note.renoteId)
			?? await this.notesRepository.findOneByOrFail({ id: note.renoteId });

		// Renote needs to include the reply!
		// This will dive one more time before landing in getNoteReply, which terminates recursion.
		// Based on the logic in NoteEntityService.pack()
		return await this.populateNote(renote, hint, true, false);
	}

	private async getNoteReply(note: MiNote | Packed<'Note'>, hint?: NotePopulationHint): Promise<PopulatedNote | null> {
		if (!note.replyId) return null;

		const reply = note.reply
			?? hint?.notes?.get(note.replyId)
			?? await this.notesRepository.findOneByOrFail({ id: note.replyId });

		return await this.populateNote(reply, hint, false, false);
	}

	@bindThis
	private async populateData(me: PopulatedMe, users: { id: string }[], hint?: NoteVisibilityHint, filters?: NoteVisibilityFilters): Promise<NoteVisibilityData> {
		// noinspection ES6MissingAwait
		const [
			userMutedThreads,
			userMutedNotes,
			userMutedInstances,
			userRelations,
			iAmModerator,
			userListMemberships,
		] = await Promise.all([
			me ? (hint?.userMutedThreads ?? this.cacheService.threadMutingsCache.fetch(me.id)) : new Set<string>(),
			me ? (hint?.userMutedNotes ?? this.cacheService.noteMutingsCache.fetch(me.id)) : new Set<string>(),
			me ? (hint?.userMutedInstances ?? this.cacheService.userProfileCache.fetch(me.id).then(p => new Set(p.mutedInstances))) : new Set<string>(),
			me ? (this.populateUserRelations(me, users, hint)) : new Map<string, UserRelation>(),
			me ? (hint?.iAmModerator ?? this.roleService.isModerator(me)) : false,
			filters?.listContext ? (hint?.userListMemberships ?? this.cacheService.listUserMembershipsCache.fetch(filters.listContext)) : new Map(),
		]);

		return {
			userMutedThreads,
			userMutedNotes,
			userMutedInstances,
			userRelations,
			userListMemberships,
			iAmModerator,
		};
	}

	private async populateUserRelations(me: NonNullable<PopulatedMe>, users: { id: string }[], hint?: NoteVisibilityHint): Promise<Map<string, UserRelation>> {
		const relations = new Map<string, UserRelation>(hint?.userRelations);
		const relationsToFetch = new Set<string>();

		if (hint?.userRelation) {
			relations.set(me.id, hint.userRelation);
		}

		for (const { id } of users) {
			if (!relations.has(id)) {
				relationsToFetch.add(id);
			}
		}

		if (relationsToFetch.size > 0) {
			const fetched = await this.cacheService.getUserRelations(me, relationsToFetch.values().toArray());
			for (const [userId, userRelation] of fetched) {
				relations.set(userId, userRelation);
			}
		}

		return relations;
	}

	@bindThis
	public checkNoteVisibility(note: PopulatedNote, me: PopulatedMe, opts: { filters?: NoteVisibilityFilters, data: NoteVisibilityData }): NoteVisibilityResult {
		// Copy note since we mutate it below
		note = {
			...note,
			renote: note.renote ? {
				...note.renote,
				renote: note.renote.renote ? { ...note.renote.renote } : null,
				reply: note.renote.reply ? { ...note.renote.reply } : null,
			} : null,
			reply: note.reply ? {
				...note.reply,
				renote: note.reply.renote ? { ...note.reply.renote } : null,
				reply: note.reply.reply ? { ...note.reply.reply } : null,
			} : null,
		} as PopulatedNote;

		this.syncVisibility(note);
		return this.checkNoteVisibilityFor(note, me, opts);
	}

	private checkNoteVisibilityFor(note: PopulatedNote, me: PopulatedMe, opts: { filters?: NoteVisibilityFilters, data: NoteVisibilityData }): NoteVisibilityResult {
		const accessible = this.isAccessible(note, me, opts.data, opts.filters);
		const { redact, reason } = !accessible ? { redact: true, reason: 'private' } : this.shouldRedact(note, me);
		const silence = this.shouldSilence(note, me, opts.data, opts.filters);

		// For boosts (pure renotes), we must recurse and pick the lowest common access level.
		if (isPopulatedBoost(note)) {
			const boostVisibility = this.checkNoteVisibilityFor(note.renote, me, opts);
			return {
				accessible: accessible && boostVisibility.accessible,
				redact: redact || boostVisibility.redact,
				silence: silence || boostVisibility.silence,
				reason: reason ?? boostVisibility.reason,
			};
		}

		return { accessible, redact, silence, reason };
	}

	// Based on NoteEntityService.isVisibleForMe
	private isAccessible(note: PopulatedNote, me: PopulatedMe, data: NoteVisibilityData, filters: NoteVisibilityFilters | undefined): boolean {
		// We can always view our own notes
		if (me?.id === note.userId) return true;

		// We can *never* view blocked notes
		if (data.userRelations.get(note.userId)?.isBlocked) return false;

		// Only moderators can view notes by suspended users / instances.
		// Mirror of QueryService.generateSuspendedUserQueryForNotes and QueryService.generateBlockedHostQueryForNotes..
		if (!data.iAmModerator) {
			if (!filters?.includeSilencedAuthor) {
				if (note.user.isSuspended) return false;
				if (note.user.host && this.utilityService.isBlockedHost(note.user.host)) return false;
			}

			if (note.reply) {
				if (note.reply.user.isSuspended) return false;
				if (note.reply.user.host && this.utilityService.isBlockedHost(note.reply.user.host)) return false;
			}

			if (note.renote) {
				if (note.renote.user.isSuspended) return false;
				if (note.renote.user.host && this.utilityService.isBlockedHost(note.renote.user.host)) return false;
			}
		}

		if (note.visibility === 'specified') {
			return this.isAccessibleDM(note, me);
		} else if (note.visibility === 'followers') {
			return this.isAccessibleFO(note, me, data);
		} else {
			return true;
		}
	}

	private isAccessibleDM(note: PopulatedNote, me: PopulatedMe): boolean {
		// Must be logged in to view DM
		if (me == null) return false;

		// Can be visible to me
		if (note.visibleUserIds.includes(me.id)) return true;

		// Otherwise invisible
		return false;
	}

	private isAccessibleFO(note: PopulatedNote, me: PopulatedMe, data: NoteVisibilityData): boolean {
		// Must be logged in to view FO
		if (me == null) return false;

		// Can be a reply to me
		if (note.reply?.userId === me.id) return true;

		// Can mention me
		if (note.mentions.includes(me.id)) return true;

		// Can be visible to me
		if (note.visibleUserIds.includes(me.id)) return true;

		// Can be followed by me
		if (data.userRelations.get(note.userId)?.isFollowing) return true;

		// Can be two remote users, since we can't verify remote->remote following.
		if (note.userHost != null && me.host != null) return true;

		// Otherwise invisible
		return false;
	}

	// Based on NoteEntityService.treatVisibility
	@bindThis
	public syncVisibility(note: PopulatedNote | Packed<'Note'>): void {
		// Make followers-only
		if (note.user.makeNotesFollowersOnlyBefore && note.visibility !== 'specified' && note.visibility !== 'followers') {
			const followersOnlyBefore = note.user.makeNotesFollowersOnlyBefore * 1000;
			const createdAt = new Date(note.createdAt).valueOf();

			// I don't understand this logic, but I tried to break it out for readability
			const followersOnlyOpt1 = followersOnlyBefore <= 0 && (this.timeService.now - createdAt > 0 - followersOnlyBefore);
			const followersOnlyOpt2 = followersOnlyBefore > 0 && (createdAt < followersOnlyBefore);
			if (followersOnlyOpt1 || followersOnlyOpt2) {
				note.visibility = 'followers';
			}
		}

		// Recurse
		if (note.renote) {
			this.syncVisibility(note.renote);
		}
		if (note.reply) {
			this.syncVisibility(note.reply);
		}
	}

	// Based on NoteEntityService.hideNote
	private shouldRedact(note: PopulatedNote, me: PopulatedMe): { redact: boolean, reason?: string } {
		// Never redact our own notes
		if (me?.id === note.userId) return { redact: false };

		// Redact if sign-in required
		if (note.user.requireSigninToViewContents && !me) return { redact: true, reason: 'require_signin' };

		// Redact if note has expired
		if (note.user.makeNotesHiddenBefore) {
			const hiddenBefore = note.user.makeNotesHiddenBefore * 1000;
			const createdAt = note.createdAt.valueOf();

			// I don't understand this logic, but I tried to break it out for readability
			const hiddenOpt1 = hiddenBefore <= 0 && (this.timeService.now - createdAt > 0 - hiddenBefore);
			const hiddenOpt2 = hiddenBefore > 0 && (createdAt < hiddenBefore);
			if (hiddenOpt1 || hiddenOpt2) return { redact: true, reason: 'expired' };
		}

		// Otherwise don't redact
		return { redact: false };
	}

	// Based on inconsistent logic from all around the app
	private shouldSilence(note: PopulatedNote, me: PopulatedMe, data: NoteVisibilityData, filters: NoteVisibilityFilters | undefined): boolean {
		if (this.shouldSilenceForMute(note, data)) {
			return true;
		}

		if (this.shouldSilenceForSilence(note, me, data, filters?.includeSilencedAuthor ?? false)) {
			return true;
		}

		if (!filters?.includeReplies && this.shouldSilenceForFollowWithoutReplies(note, me, data)) {
			return true;
		}

		return false;
	}

	private shouldSilenceForMute(note: PopulatedNote, data: NoteVisibilityData): boolean {
		// Silence if we've muted the thread
		if (data.userMutedThreads.has(note.threadId)) return true;

		// Silence if we've muted the note
		if (data.userMutedNotes.has(note.id)) return true;

		// Silence if we've muted the user
		if (data.userRelations.get(note.userId)?.isMuting) return true;

		// Silence if we've muted renotes from the user
		if (isPopulatedBoost(note) && data.userRelations.get(note.userId)?.isMutingRenotes) return true;

		// Silence if we've muted the instance
		if (note.userHost && data.userMutedInstances.has(note.userHost)) return true;

		// Otherwise don't silence
		return false;
	}

	private shouldSilenceForSilence(note: PopulatedNote, me: PopulatedMe, data: NoteVisibilityData, ignoreSilencedAuthor: boolean): boolean {
		// Don't silence if it's us
		if (note.userId === me?.id) return false;

		// Don't silence if we're following or ignoring the author
		if (!data.userRelations.get(note.userId)?.isFollowing && !ignoreSilencedAuthor) {
			// Silence if user is silenced
			if (note.user.isSilenced) return true;

			// Silence if user instance is silenced
			if (note.user.host && this.utilityService.isSilencedHost(note.user.host)) return true;
		}

		// Silence if renote is silenced
		if (note.renote && note.renote.userId !== note.userId && this.shouldSilenceForSilence(note.renote, me, data, false)) return true;

		// Silence if reply is silenced
		if (note.reply && note.reply.userId !== note.userId && this.shouldSilenceForSilence(note.reply, me, data, false)) return true;

		// Otherwise don't silence
		return false;
	}

	private shouldSilenceForFollowWithoutReplies(note: PopulatedNote, me: PopulatedMe, data: NoteVisibilityData): boolean {
		// Don't silence if it's not a reply
		if (!note.reply) return false;

		// Don't silence if it's a self-reply
		if (note.reply.userId === note.userId) return false;

		// Don't silence if it's a reply to us
		if (note.reply.userId === me?.id) return false;

		// Don't silence if it's our post
		if (note.userId === me?.id) return false;

		// Don't silence if we follow w/ replies
		if (me && data.userRelations.get(note.userId)?.isFollowingWithReplies) return false;

		// Don't silence if we're viewing in a list with replies
		if (data.userListMemberships.get(note.userId)?.withReplies) return false;

		// Silence otherwise
		return true;
	}
}

export interface PopulationData {
	populatedNotes: PopulatedNote[];
	populatedData: NoteVisibilityData;
}

export interface NoteVisibilityData {
	userMutedThreads: ReadonlySet<string>;
	userMutedNotes: ReadonlySet<string>;
	userMutedInstances: ReadonlySet<string>;
	userRelations: ReadonlyMap<string, UserRelation>;

	// userId => membership (already scoped to listContext)
	userListMemberships: Map<string, MiUserListMembership>;

	// True if "me" is a moderator or admin, false otherwise.
	iAmModerator: boolean;
}

export type NoteVisibilityHint = Partial<NoteVisibilityData> & NotePopulationHint & {
	// Relation from me to note.user
	userRelation?: UserRelation;
};

export interface NotePopulationHint {
	notes?: Map<string, MiNote | Packed<'Note'>>;
	users?: Map<string, MiUser>;
}

// This represents the *requesting* user!
export type PopulatedMe = Pick<MiUser, 'id' | 'host'> | null | undefined;

export interface PopulatedNote {
	id: string;
	threadId: string;
	userId: string;
	userHost: string | null;
	user: PopulatedUser;
	renoteId: string | null;
	renote: PopulatedNote | null;
	replyId: string | null;
	reply: PopulatedNote | null;
	mentions: string[];
	visibleUserIds: string[];
	visibility: 'public' | 'followers' | 'home' | 'specified';
	createdAt: Date;
	text: string | null;
	cw: string | null;
	hasPoll: boolean;
	fileIds: string[];
}

interface PopulatedUser {
	id: string;
	host: string | null;
	isSilenced: boolean;
	isSuspended: boolean;
	requireSigninToViewContents: boolean;
	makeNotesHiddenBefore: number | null;
	makeNotesFollowersOnlyBefore: number | null;
}

function isPopulatedBoost(note: PopulatedNote): note is PopulatedNote & { renote: PopulatedNote } {
	return note.renoteId != null
		&& note.replyId == null
		&& note.text == null
		&& note.cw == null
		&& note.fileIds.length === 0
		&& !note.hasPoll;
}
