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
import { NoteVisibilityService, type NoteVisibilityData, type PopulatedNote } from '@/core/NoteVisibilityService.js';

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
			const me = ps.me ? await this.cacheService.findUserById(ps.me.id) : null;

			let filter: (note: MiNote, populated: PopulatedNote, visData: NoteVisibilityData) => boolean = ps.noteFilter ?? (() => true);

			if (ps.excludeNoFiles) {
				const parentFilter = filter;
				filter = (note, populated, visData) => note.fileIds.length !== 0 && parentFilter(note, populated, visData);
			}

			if (ps.excludeReplies) {
				const parentFilter = filter;
				filter = (note, populated, visData) => {
					if (note.userId !== ps.me?.id && isReply(note, ps.me?.id)) return false;
					return parentFilter(note, populated, visData);
				};
			}

			if (ps.excludeBots) {
				const parentFilter = filter;
				filter = (note, populated, visData) => !note.user?.isBot && parentFilter(note, populated, visData);
			}

			if (ps.excludePureRenotes) {
				const parentFilter = filter;
				filter = (note, populated, visData) => (!isRenote(note) || isQuote(note)) && parentFilter(note, populated, visData);
			}

			{
				const parentFilter = filter;
				filter = (note, populated, visData) => {
					const { accessible, silence } = this.noteVisibilityService.checkNoteVisibility(populated, me, { data: visData, filters: {
						includeSilencedAuthor: ps.ignoreAuthorFromUserSilence,
						includeReplies: true, // Include replies because we check them elsewhere
					} });
					if (!accessible || silence) return false;

					return parentFilter(note, populated, visData);
				};
			}

			{
				const parentFilter = filter;
				filter = (note, populated, visData) => {
					if (!ps.ignoreAuthorFromInstanceBlock) {
						if (note.userHost && this.utilityService.isBlockedHost(note.userHost)) return false;
					}
					if (note.renoteUserHost && note.userId !== note.renoteUserId && this.utilityService.isBlockedHost(note.renoteUserHost)) return false;
					if (note.replyUserHost && note.userId !== note.replyUserId && this.utilityService.isBlockedHost(note.replyUserHost)) return false;

					return parentFilter(note, populated, visData);
				};
			}

			{
				const parentFilter = filter;
				filter = (note, populated, visData) => {
					if (!ps.ignoreAuthorFromUserSuspension) {
						if (note.user?.isSuspended) return false;
						if (note.userHost && !this.utilityService.isFederationAllowedHost(note.userHost)) return false;
					}
					if (note.userId !== note.renoteUserId && populated.renote?.user?.isSuspended) return false;
					if (note.userId !== note.renoteUserId && note.renoteUserHost && !this.utilityService.isFederationAllowedHost(note.renoteUserHost)) return false;
					if (note.userId !== note.replyUserId && populated.reply?.user?.isSuspended) return false;
					if (note.userId !== note.replyUserId && note.replyUserHost && !this.utilityService.isFederationAllowedHost(note.replyUserHost)) return false;

					return parentFilter(note, populated, visData);
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

				const gotFromDb = await this.getAndFilterFromDb(me, noteIds, filter, idCompare);
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

	private async getAndFilterFromDb(me: MiUser | null, noteIds: string[], noteFilter: (note: MiNote, populated: PopulatedNote, visData: NoteVisibilityData) => boolean, idCompare: (a: string, b: string) => number): Promise<MiNote[]> {
		const query = this.notesRepository.createQueryBuilder('note')
			.where('note.id IN (:...noteIds)', { noteIds: noteIds })
			.leftJoinAndSelect('note.reply', 'reply')
			.leftJoinAndSelect('note.renote', 'renote')
			.leftJoinAndSelect('note.channel', 'channel')

			// Needed for populated note
			.leftJoinAndSelect('renote.reply', 'renoteReply')
		;

		const notes = await query.getMany();
		const { populatedNotes, visData } = await this.populateNotes(notes, me);

		return populatedNotes
			.filter(({ note, populated }) => noteFilter(note, populated, visData))
			.sort((a, b) => idCompare(a.id, b.id))
			.map(({ note }) => note);
	}

	/**
	 * Given a sample of notes to return, populates the relations from cache and generates a NotePopulationData hint object.
	 * This is messy and kinda gross, but it allows us to use the synchronous checkNoteVisibility from within the filter callbacks.
	 */
	private async populateNotes(notes: MiNote[], me: MiUser | null): Promise<{ populatedNotes: { id: string, note: MiNote, populated: PopulatedNote }[], visData: NoteVisibilityData }> {
		const populationData = await this.noteVisibilityService.populate(notes, me);

		// Map back to the original note for iteration purposes
		const populatedNotes = notes
			.map(note => ({
				id: note.id,
				note: note,
				populated: populationData.populatedNotes.find(pn => pn.id === note.id),
			}))
			.filter(note => note.populated != null);

		return {
			populatedNotes: populatedNotes as { id: string, note: MiNote, populated: PopulatedNote }[],
			visData: populationData.populatedData,
		};
	}
}
