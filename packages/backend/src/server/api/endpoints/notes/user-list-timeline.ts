/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import type { MiMeta, MiUserList, NotesRepository, UserListMembershipsRepository, UserListsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { QueryService } from '@/core/QueryService.js';
import { MiLocalUser } from '@/models/User.js';
import { FanoutTimelineEndpointService } from '@/core/FanoutTimelineEndpointService.js';
import { UserListService } from '@/core/UserListService.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes', 'lists'],

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
		noSuchList: {
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '8fb1fbd5-e476-4c37-9fb0-43d55b63a2ff',
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
		listId: { type: 'string', format: 'misskey:id' },
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
	required: ['listId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.userListsRepository)
		private userListsRepository: UserListsRepository,

		@Inject(DI.userListMembershipsRepository)
		private userListMembershipsRepository: UserListMembershipsRepository,

		private noteEntityService: NoteEntityService,
		private activeUsersChart: ActiveUsersChart,
		private idService: IdService,
		private fanoutTimelineEndpointService: FanoutTimelineEndpointService,
		private queryService: QueryService,
		private readonly userListService: UserListService,
		private readonly roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate!) : null);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate!) : null);

			const list = await this.userListService.userListsCache.fetchMaybe(ps.listId);

			if (list == null) {
				throw new ApiError(meta.errors.noSuchList);
			}

			if (!list.isPublic && list.userId !== me.id) {
				throw new ApiError(meta.errors.noSuchList);
			}

			if (!this.serverSettings.enableFanoutTimeline) {
				const timeline = await this.getFromDb(list, {
					untilId,
					sinceId,
					limit: ps.limit,
					withFiles: ps.withFiles,
					withRenotes: ps.withRenotes,
				}, me);

				process.nextTick(() => {
					this.activeUsersChart.read(me);
				});

				return await this.noteEntityService.packMany(timeline, me);
			}

			const timeline = await this.fanoutTimelineEndpointService.timeline({
				untilId,
				sinceId,
				limit: ps.limit,
				allowPartial: ps.allowPartial,
				me,
				useDbFallback: this.serverSettings.enableFanoutTimelineDbFallback,
				redisTimelines: ps.withFiles ? [`userListTimelineWithFiles:${list.id}`] : [`userListTimeline:${list.id}`],
				excludePureRenotes: !ps.withRenotes,
				ignoreAuthorFromUserSilence: true,
				dbFallback: async (untilId, sinceId, limit) => await this.getFromDb(list, {
					untilId,
					sinceId,
					limit,
					withFiles: ps.withFiles,
					withRenotes: ps.withRenotes,
				}, me),
			});

			process.nextTick(() => {
				this.activeUsersChart.read(me);
			});

			return timeline;
		});
	}

	private async getFromDb(list: MiUserList, ps: {
		untilId: string | null,
		sinceId: string | null,
		limit: number,
		withFiles: boolean,
		withRenotes: boolean,
	}, me: MiLocalUser) {
		//#region Construct query
		const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), ps.sinceId, ps.untilId)
			.innerJoin(this.userListMembershipsRepository.metadata.targetName, 'userListMemberships', 'userListMemberships.userId = note.userId')
			.andWhere('userListMemberships.userListId = :userListId', { userListId: list.id })
			.andWhere('note.channelId IS NULL') // チャンネルノートではない
			.setParameters({ meId: me.id })
			.innerJoinAndSelect('note.user', 'user')
			.leftJoinAndSelect('note.reply', 'reply')
			.leftJoinAndSelect('note.renote', 'renote')
			.leftJoinAndSelect('reply.user', 'replyUser')
			.leftJoinAndSelect('renote.user', 'renoteUser')
			.limit(ps.limit);

		this.queryService.generateExcludedRepliesQueryForNotes(query, me, 'userListMemberships.withReplies');
		this.queryService.generateVisibilityQuery(query, me);
		this.queryService.generateBlockedHostQueryForNote(query);
		this.queryService.generateSuspendedUserQueryForNote(query);
		this.queryService.generateSilencedUserQueryForNotes(query, me, true);
		this.queryService.generateMutedUserQueryForNotes(query, me, true);
		this.queryService.generateBlockedUserQueryForNotes(query, me);

		if (ps.withFiles) {
			query.andWhere('note.fileIds != \'{}\'');
		}

		if (!ps.withRenotes) {
			this.queryService.generateExcludedRenotesQueryForNotes(query);
		} else {
			this.queryService.generateMutedUserRenotesQueryForNotes(query, me);
		}

		//#endregion

		return await query.getMany();
	}
}
