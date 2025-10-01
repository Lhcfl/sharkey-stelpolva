/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { CacheService } from '@/core/CacheService.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { bindThis } from '@/decorators.js';
import type { Packed } from '@/misc/json-schema.js';
import { IdService } from '@/core/IdService.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import type { MiFollowing, MiInstance, NotesRepository } from '@/models/_.js';
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
}

@Injectable()
export class NoteVisibilityService {
	constructor(
		@Inject(DI.notesRepository)
		private readonly notesRepository: NotesRepository,

		private readonly cacheService: CacheService,
		private readonly idService: IdService,
		private readonly federatedInstanceService: FederatedInstanceService,
	) {}

	@bindThis
	public async checkNoteVisibilityAsync(note: MiNote | Packed<'Note'>, user: string | PopulatedMe, opts?: { filters?: NoteVisibilityFilters, hint?: Partial<NoteVisibilityData> }): Promise<NoteVisibilityResult> {
		if (typeof(user) === 'string') {
			user = await this.cacheService.findUserById(user);
		}

		const populatedNote = await this.populateNote(note, opts?.hint);
		const populatedData = await this.populateData(user, opts?.hint ?? {});

		return this.checkNoteVisibility(populatedNote, user, { filters: opts?.filters, data: populatedData });
	}

	@bindThis
	public async populateNote(note: MiNote | Packed<'Note'>, hint?: NotePopulationData, diveReply = true, diveRenote = true): Promise<PopulatedNote> {
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

	private async getNoteUser(note: MiNote | Packed<'Note'>, hint?: NotePopulationData): Promise<PopulatedUser> {
		const user = note.user
			?? hint?.users?.get(note.userId)
			?? await this.cacheService.findUserById(note.userId);

		const instance = user.host
			? (
				user.instance
				?? hint?.instances?.get(user.host)
				?? await this.federatedInstanceService.fetchOrRegister(user.host)
			) : null;

		return {
			...user,
			makeNotesHiddenBefore: user.makeNotesHiddenBefore ?? null,
			makeNotesFollowersOnlyBefore: user.makeNotesFollowersOnlyBefore ?? null,
			requireSigninToViewContents: user.requireSigninToViewContents ?? false,
			instance: instance ? {
				...instance,
				host: user.host as string,
			} : null,
		};
	}

	private async getNoteRenote(note: MiNote | Packed<'Note'>, hint?: NotePopulationData): Promise<PopulatedNote | null> {
		if (!note.renoteId) return null;

		const renote = note.renote
			?? hint?.notes?.get(note.renoteId)
			?? await this.notesRepository.findOneByOrFail({ id: note.renoteId });

		// Renote needs to include the reply!
		// This will dive one more time before landing in getNoteReply, which terminates recursion.
		// Based on the logic in NoteEntityService.pack()
		return await this.populateNote(renote, hint, true, false);
	}

	private async getNoteReply(note: MiNote | Packed<'Note'>, hint?: NotePopulationData): Promise<PopulatedNote | null> {
		if (!note.replyId) return null;

		const reply = note.reply
			?? hint?.notes?.get(note.replyId)
			?? await this.notesRepository.findOneByOrFail({ id: note.replyId });

		return await this.populateNote(reply, hint, false, false);
	}

	@bindThis
	public async populateData(user: PopulatedMe, hint?: Partial<NoteVisibilityData>): Promise<NoteVisibilityData> {
		// noinspection ES6MissingAwait
		const [
			userBlockers,
			userFollowings,
			userMutedThreads,
			userMutedNotes,
			userMutedUsers,
			userMutedUserRenotes,
			userMutedInstances,
		] = await Promise.all([
			user ? (hint?.userBlockers ?? this.cacheService.userBlockedCache.fetch(user.id)) : null,
			user ? (hint?.userFollowings ?? this.cacheService.userFollowingsCache.fetch(user.id)) : null,
			user ? (hint?.userMutedThreads ?? this.cacheService.threadMutingsCache.fetch(user.id)) : null,
			user ? (hint?.userMutedNotes ?? this.cacheService.noteMutingsCache.fetch(user.id)) : null,
			user ? (hint?.userMutedUsers ?? this.cacheService.userMutingsCache.fetch(user.id)) : null,
			user ? (hint?.userMutedUserRenotes ?? this.cacheService.renoteMutingsCache.fetch(user.id)) : null,
			user ? (hint?.userMutedInstances ?? this.cacheService.userProfileCache.fetch(user.id).then(p => new Set(p.mutedInstances))) : null,
		]);

		return {
			userBlockers,
			userFollowings,
			userMutedThreads,
			userMutedNotes,
			userMutedUsers,
			userMutedUserRenotes,
			userMutedInstances,
		};
	}

	@bindThis
	public checkNoteVisibility(note: PopulatedNote, user: PopulatedMe, opts: { filters?: NoteVisibilityFilters, data: NoteVisibilityData }): NoteVisibilityResult {
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
		return this.checkNoteVisibilityFor(note, user, opts);
	}

	private checkNoteVisibilityFor(note: PopulatedNote, user: PopulatedMe, opts: { filters?: NoteVisibilityFilters, data: NoteVisibilityData }): NoteVisibilityResult {
		const accessible = this.isAccessible(note, user, opts.data);
		const { redact, reason } = !accessible
			? { redact: true, reason: 'private' }
			: this.shouldRedact(note, user);
		const silence = this.shouldSilence(note, user, opts.data, opts.filters);

		// For boosts (pure renotes), we must recurse and pick the lowest common access level.
		if (isPopulatedBoost(note)) {
			const boostVisibility = this.checkNoteVisibilityFor(note.renote, user, opts);
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
	private isAccessible(note: PopulatedNote, user: PopulatedMe, data: NoteVisibilityData): boolean {
		// We can always view our own notes
		if (user?.id === note.userId) return true;

		// We can *never* view blocked notes
		if (data.userBlockers?.has(note.userId)) return false;

		if (note.visibility === 'specified') {
			return this.isAccessibleDM(note, user);
		} else if (note.visibility === 'followers') {
			return this.isAccessibleFO(note, user, data);
		} else {
			return true;
		}
	}

	private isAccessibleDM(note: PopulatedNote, user: PopulatedMe): boolean {
		// Must be logged in to view DM
		if (user == null) return false;

		// Can be visible to me
		if (note.visibleUserIds.includes(user.id)) return true;

		// Otherwise invisible
		return false;
	}

	private isAccessibleFO(note: PopulatedNote, user: PopulatedMe, data: NoteVisibilityData): boolean {
		// Must be logged in to view FO
		if (user == null) return false;

		// Can be a reply to me
		if (note.reply?.userId === user.id) return true;

		// Can mention me
		if (note.mentions.includes(user.id)) return true;

		// Can be visible to me
		if (note.visibleUserIds.includes(user.id)) return true;

		// Can be followed by me
		if (data.userFollowings?.has(note.userId)) return true;

		// Can be two remote users, since we can't verify remote->remote following.
		if (note.userHost != null && user.host != null) return true;

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
			const followersOnlyOpt1 = followersOnlyBefore <= 0 && (Date.now() - createdAt > 0 - followersOnlyBefore);
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
	private shouldRedact(note: PopulatedNote, user: PopulatedMe): { redact: boolean, reason?: string } {
		// Never redact our own notes
		if (user?.id === note.userId) return { redact: false };

		// Redact if sign-in required
		if (note.user.requireSigninToViewContents && !user) return { redact: true, reason: 'require_signin' };

		// Redact if note has expired
		if (note.user.makeNotesHiddenBefore) {
			const hiddenBefore = note.user.makeNotesHiddenBefore * 1000;
			const createdAt = note.createdAt.valueOf();

			// I don't understand this logic, but I tried to break it out for readability
			const hiddenOpt1 = hiddenBefore <= 0 && (Date.now() - createdAt > 0 - hiddenBefore);
			const hiddenOpt2 = hiddenBefore > 0 && (createdAt < hiddenBefore);
			if (hiddenOpt1 || hiddenOpt2) return { redact: true, reason: 'expired' };
		}

		// Otherwise don't redact
		return { redact: false };
	}

	// Based on inconsistent logic from all around the app
	private shouldSilence(note: PopulatedNote, user: PopulatedMe, data: NoteVisibilityData, filters: NoteVisibilityFilters | undefined): boolean {
		if (this.shouldSilenceForMute(note, data)) {
			return true;
		}

		if (this.shouldSilenceForSilence(note, user, data, filters?.includeSilencedAuthor ?? false)) {
			return true;
		}

		if (!filters?.includeReplies && this.shouldSilenceForFollowWithoutReplies(note, user, data)) {
			return true;
		}

		return false;
	}

	private shouldSilenceForMute(note: PopulatedNote, data: NoteVisibilityData): boolean {
		// Silence if we've muted the thread
		if (data.userMutedThreads?.has(note.threadId)) return true;

		// Silence if we've muted the note
		if (data.userMutedNotes?.has(note.id)) return true;

		// Silence if we've muted the user
		if (data.userMutedUsers?.has(note.userId)) return true;

		// Silence if we've muted renotes from the user
		if (isPopulatedBoost(note) && data.userMutedUserRenotes?.has(note.userId)) return true;

		// Silence if we've muted the instance
		if (note.userHost && data.userMutedInstances?.has(note.userHost)) return true;

		// Otherwise don't silence
		return false;
	}

	private shouldSilenceForSilence(note: PopulatedNote, user: PopulatedMe, data: NoteVisibilityData, ignoreSilencedAuthor: boolean): boolean {
		// Don't silence if it's us
		if (note.userId === user?.id) return false;

		// Don't silence if we're following or ignoring the author
		if (!data.userFollowings?.has(note.userId) && !ignoreSilencedAuthor) {
			// Silence if user is silenced
			if (note.user.isSilenced) return true;

			// Silence if user instance is silenced
			if (note.user.instance?.isSilenced) return true;
		}

		// Silence if renote is silenced
		if (note.renote && note.renote.userId !== note.userId && this.shouldSilenceForSilence(note.renote, user, data, false)) return true;

		// Silence if reply is silenced
		if (note.reply && note.reply.userId !== note.userId && this.shouldSilenceForSilence(note.reply, user, data, false)) return true;

		// Otherwise don't silence
		return false;
	}

	private shouldSilenceForFollowWithoutReplies(note: PopulatedNote, user: PopulatedMe, data: NoteVisibilityData): boolean {
		// Don't silence if it's not a reply
		if (!note.reply) return false;

		// Don't silence if it's a self-reply
		if (note.reply.userId === note.userId) return false;

		// Don't silence if it's a reply to us
		if (note.reply.userId === user?.id) return false;

		// Don't silence if it's our post
		if (note.userId === user?.id) return false;

		// Don't silence if we follow w/ replies
		if (user && data.userFollowings?.get(user.id)?.withReplies) return false;

		// Silence otherwise
		return true;
	}
}

export interface NoteVisibilityData extends NotePopulationData {
	userBlockers: Set<string> | null;
	userFollowings: Map<string, Omit<MiFollowing, 'isFollowerHibernated'>> | null;
	userMutedThreads: Set<string> | null;
	userMutedNotes: Set<string> | null;
	userMutedUsers: Set<string> | null;
	userMutedUserRenotes: Set<string> | null;
	userMutedInstances: Set<string> | null;
}

export interface NotePopulationData {
	notes?: Map<string, MiNote>;
	users?: Map<string, MiUser>;
	instances?: Map<string, MiInstance>;
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
	instance: PopulatedInstance | null;
	isSilenced: boolean;
	requireSigninToViewContents: boolean;
	makeNotesHiddenBefore: number | null;
	makeNotesFollowersOnlyBefore: number | null;
}

interface PopulatedInstance {
	host: string;
	isSilenced: boolean;
}

function isPopulatedBoost(note: PopulatedNote): note is PopulatedNote & { renote: PopulatedNote } {
	return note.renoteId != null
		&& note.replyId == null
		&& note.text == null
		&& note.cw == null
		&& note.fileIds.length === 0
		&& !note.hasPoll;
}
