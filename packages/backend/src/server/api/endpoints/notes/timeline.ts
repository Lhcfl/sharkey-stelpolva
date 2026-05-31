/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository, ChannelFollowingsRepository, MiMeta } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { MiLocalUser } from '@/models/User.js';
import { FanoutTimelineEndpointService } from '@/core/FanoutTimelineEndpointService.js';
import { ApiError } from '../../error.js';
import { UserService } from '@/core/UserService.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},

	errors: {
		bothWithRepliesAndWithFiles: {
			message: 'Specifying both withReplies and withFiles is not supported',
			code: 'BOTH_WITH_REPLIES_AND_WITH_FILES',
			id: 'dfaa3eb7-8002-4cb7-bcc4-1095df46656f',
		},
	},
	// 10 calls per 5 seconds
	limit: {
		duration: 1000 * 5,
		max: 10,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		allowPartial: { type: 'boolean', default: false }, // true is recommended but for compatibility false by default
		withFiles: { type: 'boolean', default: false },
		withRenotes: { type: 'boolean', default: true },
		withBots: { type: 'boolean', default: true },
		withReplies: { type: 'boolean', default: false },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.channelFollowingsRepository)
		private channelFollowingsRepository: ChannelFollowingsRepository,

		private noteEntityService: NoteEntityService,
		private activeUsersChart: ActiveUsersChart,
		private idService: IdService,
		private fanoutTimelineEndpointService: FanoutTimelineEndpointService,
		private userFollowingService: UserFollowingService,
		private queryService: QueryService,
		private readonly userService: UserService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate!) : null);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate!) : null);

			this.userService.markUserActive(me);

			if (!this.serverSettings.enableFanoutTimeline) {
				const timeline = await this.getFromDb({
					untilId,
					sinceId,
					limit: ps.limit,
					withFiles: ps.withFiles,
					withRenotes: ps.withRenotes,
					withBots: ps.withBots,
					withReplies: ps.withReplies,
				}, me);
				return await this.noteEntityService.packMany(timeline, me);
			}

			const timeline = this.fanoutTimelineEndpointService.timeline({
				untilId,
				sinceId,
				limit: ps.limit,
				allowPartial: ps.allowPartial,
				me,
				useDbFallback: this.serverSettings.enableFanoutTimelineDbFallback,
				redisTimelines: ps.withFiles ? [`homeTimelineWithFiles:${me.id}`] : [`homeTimeline:${me.id}`],
				excludePureRenotes: !ps.withRenotes,
				dbFallback: async (untilId, sinceId, limit) => await this.getFromDb({
					untilId,
					sinceId,
					limit,
					withFiles: ps.withFiles,
					withRenotes: ps.withRenotes,
					withBots: ps.withBots,
					withReplies: ps.withReplies,
				}, me),
			});

			return timeline;
		});
	}

	private async getFromDb(ps: {
		untilId: string | null;
		sinceId: string | null;
		limit: number;
		withFiles: boolean;
		withRenotes: boolean;
		withBots: boolean;
		withReplies: boolean;
	}, me: MiLocalUser) {
		//#region Construct query
		const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), ps.sinceId, ps.untilId)
			// in a channel I follow OR my own post OR by a user I follow
			.andWhere(new Brackets(qb => this.queryService
				.orFollowingChannel(qb, ':meId', 'note.channelId')
				.orWhere(':meId = note.userId')
				.orWhere(new Brackets(qb2 => this.queryService
					.andFollowingUser(qb2, ':meId', 'note.userId')
					.andWhere('note.channelId IS NULL'))),
			))
			.setParameters({ meId: me.id })
			.innerJoinAndSelect('note.user', 'user')
			.leftJoinAndSelect('note.reply', 'reply')
			.leftJoinAndSelect('note.renote', 'renote')
			.leftJoinAndSelect('reply.user', 'replyUser')
			.leftJoinAndSelect('renote.user', 'renoteUser')
			.limit(ps.limit);

		if (!ps.withReplies) {
			this.queryService.generateExcludedRepliesQueryForNotes(query, me);
		}
		this.queryService.generateVisibilityQuery(query, me);
		this.queryService.generateBlockedHostQueryForNote(query);
		this.queryService.generateSuspendedUserQueryForNote(query);
		this.queryService.generateSilencedUserQueryForNotes(query, me);
		this.queryService.generateMutedUserQueryForNotes(query, me);
		this.queryService.generateBlockedUserQueryForNotes(query, me);
		this.queryService.generateMutedNoteThreadQuery(query, me);

		if (ps.withFiles) {
			query.andWhere('note.fileIds != \'{}\'');
		}

		if (!ps.withBots) query.andWhere('user.isBot = FALSE');

		if (!ps.withRenotes) {
			this.queryService.generateExcludedRenotesQueryForNotes(query);
		} else {
			this.queryService.generateMutedUserRenotesQueryForNotes(query, me);
		}
		//#endregion

		return await query.getMany();
	}
}
