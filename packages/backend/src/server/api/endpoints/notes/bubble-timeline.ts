import { Inject, Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { CacheService } from '@/core/CacheService.js';
import { MetaService } from '@/core/MetaService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes'],

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
		btlDisabled: {
			message: 'Bubble timeline has been disabled.',
			code: 'BTL_DISABLED',
			id: '0332fc13-6ab2-4427-ae80-a9fadffd1a6c',
		},

		bothWithRepliesAndWithFiles: {
			message: 'Specifying both withReplies and withFiles is not supported',
			code: 'BOTH_WITH_REPLIES_AND_WITH_FILES',
			id: 'dfaa3eb7-8002-4cb7-bcc4-1095df46656f',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		withFiles: { type: 'boolean', default: false },
		withBots: { type: 'boolean', default: true },
		withRenotes: { type: 'boolean', default: true },
		withReplies: { type: 'boolean', default: true },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private noteEntityService: NoteEntityService,
		private queryService: QueryService,
		private roleService: RoleService,
		private activeUsersChart: ActiveUsersChart,
		private cacheService: CacheService,
		private metaService: MetaService,
		private userFollowingService: UserFollowingService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const policies = await this.roleService.getUserPolicies(me ? me.id : null);
			const instance = await this.metaService.fetch();
			if (!policies.btlAvailable) {
				throw new ApiError(meta.errors.btlDisabled);
			}

			const [
				followings,
			] = me ? await Promise.all([
				this.cacheService.userFollowingsCache.fetch(me.id),
			]) : [undefined];

			if (ps.withReplies && ps.withFiles) throw new ApiError(meta.errors.bothWithRepliesAndWithFiles);

			//#region Construct query
			const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'),
				ps.sinceId, ps.untilId, ps.sinceDate, ps.untilDate)
				.andWhere('note.visibility = \'public\'')
				.andWhere('note.channelId IS NULL')
				.andWhere(new Brackets(qb => {
					qb.where('note.userHost IN (:...hosts)', { hosts: instance.bubbleInstances });
					if (instance.bubbleInstances.includes('#local')) {
						qb.orWhere('note.userHost IS NULL');
					}
				}))
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.leftJoinAndSelect('renote.user', 'renoteUser');

			if (me) {
				this.queryService.generateMutedUserQuery(query, me);
				this.queryService.generateBlockedUserQuery(query, me);
				this.queryService.generateMutedUserRenotesQueryForNotes(query, me);
			}

			if (ps.withFiles) {
				query.andWhere('note.fileIds != \'{}\'');
			}

			if (!ps.withBots) query.andWhere('user.isBot = FALSE');

			if (ps.withRenotes === false) {
				query.andWhere(new Brackets(qb => {
					qb.where('note.renoteId IS NULL');
					qb.orWhere(new Brackets(qb => {
						qb.where('note.text IS NOT NULL');
						qb.orWhere('note.fileIds != \'{}\'');
					}));
				}));
			}

			if (!ps.withReplies) {
				if (me) {
					const followees = await this.userFollowingService.getFollowees(me.id);
					const shouldShowReplyUserIds = [me.id, ...followees.filter(x => x.withReplies).map(x => x.followeeId)];
					query.andWhere(new Brackets(qb => {
						qb
							.where('note.replyId IS NULL') // 返信ではない
							.orWhere('note.replyUserId = :meId', { meId: me.id }) // reply my note
							.orWhere(new Brackets(qb => {
								qb // 返信だけど投稿者自身への返信
									.where('note.replyId IS NOT NULL')
									.andWhere('note.replyUserId = note.userId');
							}))
							.orWhere('note.userId IN (:...shouldShowReplyUserIds)', {
								shouldShowReplyUserIds,
							});
					}));
				} else {
					query.andWhere(new Brackets(qb => {
						qb
							.where('note.replyId IS NULL') // 返信ではない
							.orWhere(new Brackets(qb => {
								qb // 返信だけど投稿者自身への返信
									.where('note.replyId IS NOT NULL')
									.andWhere('note.replyUserId = note.userId');
							}));
					}));
				}
			}

			//#endregion

			let timeline = await query.limit(ps.limit).getMany();

			timeline = timeline.filter(note => {
				if (note.user?.isSilenced && me && followings && note.userId !== me.id && !followings[note.userId]) return false;
				return true;
			});

			process.nextTick(() => {
				if (me) {
					this.activeUsersChart.read(me);
				}
			});

			return await this.noteEntityService.packMany(timeline, me);
		});
	}
}
