/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ChannelsRepository, MiMeta, NotesRepository } from '@/models/_.js';
import { QueryService } from '@/core/QueryService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { FanoutTimelineEndpointService } from '@/core/FanoutTimelineEndpointService.js';
import { MiLocalUser } from '@/models/User.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes', 'channels'],

	requireCredential: false,

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
		noSuchChannel: {
			message: 'No such channel.',
			code: 'NO_SUCH_CHANNEL',
			id: '4d0eeeba-a02c-4c3c-9966-ef60d38d2e7f',
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
		channelId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		allowPartial: { type: 'boolean', default: false }, // true is recommended but for compatibility false by default
		withRenotes: { type: 'boolean', default: true },
		withFiles: {
			type: 'boolean',
			default: false,
			description: 'Only show notes that have attached files.',
		},
	},
	required: ['channelId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		private idService: IdService,
		private noteEntityService: NoteEntityService,
		private queryService: QueryService,
		private fanoutTimelineEndpointService: FanoutTimelineEndpointService,
		private activeUsersChart: ActiveUsersChart,
	) {
		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate!) : null);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate!) : null);

			const channel = await this.channelsRepository.findOneBy({
				id: ps.channelId,
			});

			if (channel == null) {
				throw new ApiError(meta.errors.noSuchChannel);
			}

			if (me) {
				process.nextTick(() => {
					this.activeUsersChart.read(me);
				});
			}

			if (!this.serverSettings.enableFanoutTimeline) {
				return await this.noteEntityService.packMany(await this.getFromDb({ untilId, sinceId, limit: ps.limit, channelId: channel.id, withFiles: ps.withFiles, withRenotes: ps.withRenotes }, me), me);
			}

			return await this.fanoutTimelineEndpointService.timeline({
				untilId,
				sinceId,
				limit: ps.limit,
				allowPartial: ps.allowPartial,
				me,
				useDbFallback: true,
				redisTimelines: [`channelTimeline:${channel.id}`],
				excludePureRenotes: !ps.withRenotes,
				excludeNoFiles: ps.withFiles,
				dbFallback: async (untilId, sinceId, limit) => {
					return await this.getFromDb({ untilId, sinceId, limit, channelId: channel.id, withFiles: ps.withFiles, withRenotes: ps.withRenotes }, me);
				},
			});
		});
	}

	private async getFromDb(ps: {
		untilId: string | null,
		sinceId: string | null,
		limit: number,
		channelId: string,
		withFiles: boolean,
		withRenotes: boolean,
	}, me: MiLocalUser | null) {
		//#region fallback to database
		const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), ps.sinceId, ps.untilId)
			.andWhere('note.channelId = :channelId', { channelId: ps.channelId })
			.innerJoinAndSelect('note.user', 'user')
			.leftJoinAndSelect('note.reply', 'reply')
			.leftJoinAndSelect('note.renote', 'renote')
			.leftJoinAndSelect('reply.user', 'replyUser')
			.leftJoinAndSelect('renote.user', 'renoteUser')
			.leftJoinAndSelect('note.channel', 'channel')
			.limit(ps.limit);

		this.queryService.generateVisibilityQuery(query, me);
		this.queryService.generateBlockedHostQueryForNote(query);
		this.queryService.generateSuspendedUserQueryForNote(query);
		this.queryService.generateSilencedUserQueryForNotes(query, me);
		if (me) {
			this.queryService.generateMutedUserQueryForNotes(query, me);
			this.queryService.generateBlockedUserQueryForNotes(query, me);
			this.queryService.generateMutedNoteThreadQuery(query, me);
		}

		if (ps.withFiles) {
			query.andWhere('note.fileIds != \'{}\'');
		}

		if (!ps.withRenotes) {
			this.queryService.generateExcludedRenotesQueryForNotes(query);
		} else if (me) {
			this.queryService.generateMutedUserRenotesQueryForNotes(query, me);
		}
		//#endregion

		return await query.getMany();
	}
}
