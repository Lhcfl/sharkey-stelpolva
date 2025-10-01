/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { MiUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import type { MiMeta } from '@/models/Meta.js';
import { Packed } from '@/misc/json-schema.js';
import type { NotesRepository } from '@/models/_.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { FanoutTimelineName, FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import { CacheService } from '@/core/CacheService.js';
import { isReply } from '@/misc/is-reply.js';
import { isInstanceMuted } from '@/misc/is-instance-muted.js';
import { NotePopulationData, NoteVisibilityService, PopulatedNote } from '@/core/NoteVisibilityService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';

type TimelineOptions = {
	untilId: string | null,
	sinceId: string | null,
	limit: number,
	allowPartial: boolean,
	me?: { id: MiUser['id'] } | undefined | null,
	useDbFallback: boolean,
	redisTimelines: FanoutTimelineName[],
	noteFilter?: (note: MiNote) => boolean,
	ignoreAuthorFromBlock?: boolean;
	ignoreAuthorFromMute?: boolean;
	ignoreAuthorFromInstanceBlock?: boolean;
	excludeNoFiles?: boolean;
	excludeReplies?: boolean;
	excludeBots?: boolean;
	excludePureRenotes: boolean;
	includeMutedNotes?: boolean;
	ignoreAuthorFromUserSuspension?: boolean;
	ignoreAuthorFromUserSilence?: boolean;
	dbFallback: (untilId: string | null, sinceId: string | null, limit: number) => Promise<MiNote[]>,
};

@Injectable()
export class FanoutTimelineEndpointService {
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.meta)
		private meta: MiMeta,

		private noteEntityService: NoteEntityService,
		private cacheService: CacheService,
		private fanoutTimelineService: FanoutTimelineService,
		private utilityService: UtilityService,
		private readonly noteVisibilityService: NoteVisibilityService,
		private readonly federatedInstanceService: FederatedInstanceService,
	) {
	}

	@bindThis
	async timeline(ps: TimelineOptions): Promise<Packed<'Note'>[]> {
		return await this.noteEntityService.packMany(await this.getMiNotes(ps), ps.me);
	}

	@bindThis
	async getMiNotes(ps: TimelineOptions): Promise<MiNote[]> {
		// 呼び出し元と以下の処理をシンプルにするためにdbFallbackを置き換える
		if (!ps.useDbFallback) ps.dbFallback = () => Promise.resolve([]);

		const ascending = ps.sinceId && !ps.untilId;
		const idCompare: (a: string, b: string) => number = ascending ? (a, b) => a < b ? -1 : 1 : (a, b) => a > b ? -1 : 1;

		const redisResult = await this.fanoutTimelineService.getMulti(ps.redisTimelines, ps.untilId, ps.sinceId);

		// TODO: いい感じにgetMulti内でソート済だからuniqするときにredisResultが全てソート済なのを利用して再ソートを避けたい
		const redisResultIds = Array.from(new Set(redisResult.flat(1))).sort(idCompare);

		let noteIds = redisResultIds.slice(0, ps.limit);
		const oldestNoteId = ascending ? redisResultIds[0] : redisResultIds[redisResultIds.length - 1];
		const shouldFallbackToDb = noteIds.length === 0 || ps.sinceId != null && ps.sinceId < oldestNoteId;

		if (!shouldFallbackToDb) {
			let filter: (note: MiNote, populated: PopulatedNote) => boolean = ps.noteFilter ?? (() => true);

			if (ps.excludeNoFiles) {
				const parentFilter = filter;
				filter = (note, populated) => note.fileIds.length !== 0 && parentFilter(note, populated);
			}

			if (ps.excludeReplies) {
				const parentFilter = filter;
				filter = (note, populated) => {
					if (note.userId !== ps.me?.id && isReply(note, ps.me?.id)) return false;
					return parentFilter(note, populated);
				};
			}

			if (ps.excludeBots) {
				const parentFilter = filter;
				filter = (note, populated) => !note.user?.isBot && parentFilter(note, populated);
			}

			if (ps.excludePureRenotes) {
				const parentFilter = filter;
				filter = (note, populated) => (!isRenote(note) || isQuote(note)) && parentFilter(note, populated);
			}

			{
				const me = ps.me ? await this.cacheService.findUserById(ps.me.id) : null;
				const data = await this.noteVisibilityService.populateData(me);

				const parentFilter = filter;
				filter = (note, populated) => {
					const { accessible, silence } = this.noteVisibilityService.checkNoteVisibility(populated, me, { data, filters: { includeSilencedAuthor: ps.ignoreAuthorFromUserSilence } });
					if (!accessible || silence) return false;

					return parentFilter(note, populated);
				};
			}

			{
				const parentFilter = filter;
				filter = (note, populated) => {
					if (!ps.ignoreAuthorFromInstanceBlock) {
						if (note.user?.instance?.isBlocked) return false;
					}
					if (note.userId !== note.renoteUserId && note.renote?.user?.instance?.isBlocked) return false;
					if (note.userId !== note.replyUserId && note.reply?.user?.instance?.isBlocked) return false;

					return parentFilter(note, populated);
				};
			}

			{
				const parentFilter = filter;
				filter = (note, populated) => {
					if (!ps.ignoreAuthorFromUserSuspension) {
						if (note.user?.isSuspended) return false;
					}
					if (note.userId !== note.renoteUserId && note.renote?.user?.isSuspended) return false;
					if (note.userId !== note.replyUserId && note.reply?.user?.isSuspended) return false;

					return parentFilter(note, populated);
				};
			}

			const redisTimeline: MiNote[] = [];
			let readFromRedis = 0;
			let lastSuccessfulRate = 1; // rateをキャッシュする？

			while ((redisResultIds.length - readFromRedis) !== 0) {
				const remainingToRead = ps.limit - redisTimeline.length;

				// DBからの取り直しを減らす初回と同じ割合以上で成功すると仮定するが、クエリの長さを考えて三倍まで
				const countToGet = Math.ceil(remainingToRead * Math.min(1.1 / lastSuccessfulRate, 3));
				noteIds = redisResultIds.slice(readFromRedis, readFromRedis + countToGet);

				readFromRedis += noteIds.length;

				const gotFromDb = await this.getAndFilterFromDb(noteIds, filter, idCompare);
				redisTimeline.push(...gotFromDb);
				lastSuccessfulRate = gotFromDb.length / noteIds.length;

				if (ps.allowPartial ? redisTimeline.length !== 0 : redisTimeline.length >= ps.limit) {
					// 十分Redisからとれた
					return redisTimeline.slice(0, ps.limit);
				}
			}

			// まだ足りない分はDBにフォールバック
			const remainingToRead = ps.limit - redisTimeline.length;
			let dbUntil: string | null;
			let dbSince: string | null;
			if (ascending) {
				dbUntil = ps.untilId;
				dbSince = noteIds[noteIds.length - 1];
			} else {
				dbUntil = noteIds[noteIds.length - 1];
				dbSince = ps.sinceId;
			}
			const gotFromDb = await ps.dbFallback(dbUntil, dbSince, remainingToRead);
			return [...redisTimeline, ...gotFromDb];
		}

		return await ps.dbFallback(ps.untilId, ps.sinceId, ps.limit);
	}

	private async getAndFilterFromDb(noteIds: string[], noteFilter: (note: MiNote, populated: PopulatedNote) => boolean, idCompare: (a: string, b: string) => number): Promise<MiNote[]> {
		const query = this.notesRepository.createQueryBuilder('note')
			.where('note.id IN (:...noteIds)', { noteIds: noteIds })
			.leftJoinAndSelect('note.reply', 'reply')
			.leftJoinAndSelect('note.renote', 'renote')
			.leftJoinAndSelect('note.channel', 'channel')

			// Needed for populated note
			.leftJoinAndSelect('renote.reply', 'renoteReply')
		;

		const notes = await query.getMany();

		const populatedNotes = await this.populateNotes(notes);
		return populatedNotes
			.filter(({ note, populated }) => noteFilter(note, populated))
			.sort((a, b) => idCompare(a.id, b.id))
			.map(({ note }) => note);
	}

	/**
	 * Given a sample of notes to return, populates the relations from cache and generates a NotePopulationData hint object.
	 * This is messy and kinda gross, but it allows us to use the synchronous checkNoteVisibility from within the filter callbacks.
	 */
	private async populateNotes(notes: MiNote[]): Promise<{ id: string, note: MiNote, populated: PopulatedNote }[]> {
		// Manually populate user/instance since it's cacheable and avoids many joins.
		// These fields *must* be populated or NoteVisibilityService won't work right!
		const populationData = await this.populateUsers(notes);

		// This is async, but it should never await because we populate above.
		return await Promise.all(notes.map(async note => ({
			id: note.id,
			note: note,
			populated: await this.noteVisibilityService.populateNote(note, populationData),
		})));
	}

	/**
	 * This does two things:
	 * 1. Populates the user/instance relations of every note in the object graph.
	 * 2. Returns fetched note/user/instance maps for use as hint data for NoteVisibilityService.
	 */
	private async populateUsers(notes: MiNote[]): Promise<NotePopulationData> {
		// Enumerate all related data
		const allNotes = new Map<string, MiNote>();
		const usersToFetch = new Set<string>();
		const instancesToFetch = new Set<string>();

		for (const note of notes) {
			// note
			allNotes.set(note.id, note);
			usersToFetch.add(note.userId);
			if (note.userHost) {
				instancesToFetch.add(note.userHost);
			}

			// note.reply
			if (note.reply) {
				allNotes.set(note.reply.id, note.reply);
				usersToFetch.add(note.reply.userId);
				if (note.reply.userHost) {
					instancesToFetch.add(note.reply.userHost);
				}
			}

			// note.renote
			if (note.renote) {
				allNotes.set(note.renote.id, note.renote);
				usersToFetch.add(note.renote.userId);
				if (note.renote.userHost) {
					instancesToFetch.add(note.renote.userHost);
				}
			}

			// note.renote.reply
			if (note.renote?.reply) {
				allNotes.set(note.renote.reply.id, note.renote.reply);
				usersToFetch.add(note.renote.reply.userId);
				if (note.renote.reply.userHost) {
					instancesToFetch.add(note.renote.reply.userHost);
				}
			}
		}

		// Fetch everything and populate users
		const [users, instances] = await Promise.all([
			this.cacheService.getUsers(usersToFetch),
			this.federatedInstanceService.federatedInstanceCache.fetchMany(instancesToFetch).then(i => new Map(i)),
		]);
		for (const [id, user] of Array.from(users)) {
			users.set(id, {
				...user,
				instance: (user.host && instances.get(user.host)) || null,
			});
		}

		// Assign users back to notes
		for (const note of notes) {
			note.user = users.get(note.userId) ?? null;
			if (note.reply) {
				note.reply.user = users.get(note.reply.userId) ?? null;
			}
			if (note.renote) {
				note.renote.user = users.get(note.renote.userId) ?? null;
				if (note.renote.reply) {
					note.renote.reply.user = users.get(note.renote.reply.userId) ?? null;
				}
			}
		}

		// Optimization: return our accumulated data to avoid duplicate lookups later
		return { users, instances, notes: allNotes };
	}
}
