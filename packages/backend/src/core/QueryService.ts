/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets, Not, WhereExpressionBuilder } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { MiUser } from '@/models/User.js';
import { MiInstance } from '@/models/Instance.js';
import type { UserProfilesRepository, FollowingsRepository, ChannelFollowingsRepository, BlockingsRepository, NoteThreadMutingsRepository, MutingsRepository, RenoteMutingsRepository, MiMeta, InstancesRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import type { SelectQueryBuilder, ObjectLiteral } from 'typeorm';

@Injectable()
export class QueryService {
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.channelFollowingsRepository)
		private channelFollowingsRepository: ChannelFollowingsRepository,

		@Inject(DI.blockingsRepository)
		private blockingsRepository: BlockingsRepository,

		@Inject(DI.noteThreadMutingsRepository)
		private noteThreadMutingsRepository: NoteThreadMutingsRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		@Inject(DI.renoteMutingsRepository)
		private renoteMutingsRepository: RenoteMutingsRepository,

		@Inject(DI.instancesRepository)
		private readonly instancesRepository: InstancesRepository,

		@Inject(DI.meta)
		private meta: MiMeta,

		private idService: IdService,
	) {
	}

	public makePaginationQuery<T extends ObjectLiteral>(
		q: SelectQueryBuilder<T>,
		sinceId?: string | null,
		untilId?: string | null,
		sinceDate?: number | null,
		untilDate?: number | null,
		targetColumn = 'id',
	): SelectQueryBuilder<T> {
		if (sinceId && untilId) {
			q.andWhere(`${q.alias}.${targetColumn} > :sinceId`, { sinceId: sinceId });
			q.andWhere(`${q.alias}.${targetColumn} < :untilId`, { untilId: untilId });
			q.orderBy(`${q.alias}.${targetColumn}`, 'DESC');
		} else if (sinceId) {
			q.andWhere(`${q.alias}.${targetColumn} > :sinceId`, { sinceId: sinceId });
			q.orderBy(`${q.alias}.${targetColumn}`, 'ASC');
		} else if (untilId) {
			q.andWhere(`${q.alias}.${targetColumn} < :untilId`, { untilId: untilId });
			q.orderBy(`${q.alias}.${targetColumn}`, 'DESC');
		} else if (sinceDate && untilDate) {
			q.andWhere(`${q.alias}.${targetColumn} > :sinceId`, { sinceId: this.idService.gen(sinceDate) });
			q.andWhere(`${q.alias}.${targetColumn} < :untilId`, { untilId: this.idService.gen(untilDate) });
			q.orderBy(`${q.alias}.${targetColumn}`, 'DESC');
		} else if (sinceDate) {
			q.andWhere(`${q.alias}.${targetColumn} > :sinceId`, { sinceId: this.idService.gen(sinceDate) });
			q.orderBy(`${q.alias}.${targetColumn}`, 'ASC');
		} else if (untilDate) {
			q.andWhere(`${q.alias}.${targetColumn} < :untilId`, { untilId: this.idService.gen(untilDate) });
			q.orderBy(`${q.alias}.${targetColumn}`, 'DESC');
		} else {
			q.orderBy(`${q.alias}.${targetColumn}`, 'DESC');
		}
		return q;
	}

	// ここでいうBlockedは被Blockedの意
	@bindThis
	public generateBlockedUserQueryForNotes<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me: { id: MiUser['id'] }): SelectQueryBuilder<E> {
		// 投稿の作者にブロックされていない かつ
		// 投稿の返信先の作者にブロックされていない かつ
		// 投稿の引用元の作者にブロックされていない
		return this
			.andNotBlockingUser(q, 'note.userId', ':meId')
			.andWhere(new Brackets(qb => this
				.orNotBlockingUser(qb, 'note.replyUserId', ':meId')
				.orWhere('note.replyUserId IS NULL')))
			.andWhere(new Brackets(qb => this
				.orNotBlockingUser(qb, 'note.renoteUserId', ':meId')
				.orWhere('note.renoteUserId IS NULL')))
			.setParameters({ meId: me.id });
	}

	@bindThis
	public generateBlockQueryForUsers<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me: { id: MiUser['id'] }): SelectQueryBuilder<E> {
		this.andNotBlockingUser(q, ':meId', 'user.id');
		this.andNotBlockingUser(q, 'user.id', ':meId');
		return q.setParameters({ meId: me.id });
	}

	@bindThis
	public generateMutedNoteThreadQuery<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me: { id: MiUser['id'] }): SelectQueryBuilder<E> {
		return this
			.andNotMutingThread(q, ':meId', 'note.id')
			.andWhere(new Brackets(qb => this
				.orNotMutingThread(qb, ':meId', 'note.threadId')
				.orWhere('note.threadId IS NULL')))
			.setParameters({ meId: me.id });
	}

	@bindThis
	public generateMutedUserQueryForNotes<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me: { id: MiUser['id'] }, exclude?: { id: MiUser['id'] }): SelectQueryBuilder<E> {
		// 投稿の作者をミュートしていない かつ
		// 投稿の返信先の作者をミュートしていない かつ
		// 投稿の引用元の作者をミュートしていない
		return this
			.andNotMutingUser(q, ':meId', 'note.userId', exclude)
			.andWhere(new Brackets(qb => this
				.orNotMutingUser(qb, ':meId', 'note.replyUserId', exclude)
				.orWhere('note.replyUserId IS NULL')))
			.andWhere(new Brackets(qb => this
				.orNotMutingUser(qb, ':meId', 'note.renoteUserId', exclude)
				.orWhere('note.renoteUserId IS NULL')))
			// TODO exclude should also pass a host to skip these instances
			// mute instances
			.andWhere(new Brackets(qb => this
				.andNotMutingInstance(qb, ':meId', 'note.userHost')
				.orWhere('note.userHost IS NULL')))
			.andWhere(new Brackets(qb => this
				.orNotMutingInstance(qb, ':meId', 'note.replyUserHost')
				.orWhere('note.replyUserHost IS NULL')))
			.andWhere(new Brackets(qb => this
				.orNotMutingInstance(qb, ':meId', 'note.renoteUserHost')
				.orWhere('note.renoteUserHost IS NULL')))
			.setParameters({ meId: me.id });
	}

	@bindThis
	public generateMutedUserQueryForUsers<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me: { id: MiUser['id'] }): SelectQueryBuilder<E> {
		return this
			.andNotMutingUser(q, ':meId', 'user.id')
			.setParameters({ meId: me.id });
	}

	// This intentionally skips isSuspended, isDeleted, makeNotesFollowersOnlyBefore, makeNotesHiddenBefore, and requireSigninToViewContents.
	// NoteEntityService checks these automatically and calls hideNote() to hide them without breaking threads.
	// For moderation purposes, you can set isSilenced to forcibly hide existing posts by a user.
	@bindThis
	public generateVisibilityQuery<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me?: { id: MiUser['id'] } | null): SelectQueryBuilder<E> {
		// This code must always be synchronized with the checks in Notes.isVisibleForMe.
		return q.andWhere(new Brackets(qb => {
			// Public post
			qb.orWhere('note.visibility = \'public\'')
				.orWhere('note.visibility = \'home\'');

			if (me != null) {
				qb
					// My post
					.orWhere(':meId = note.userId')
					// Visible to me
					.orWhere(':meIdAsList <@ note.visibleUserIds')
					// Followers-only post
					.orWhere(new Brackets(qb => qb
						.andWhere(new Brackets(qbb => this
							// Following author
							.orFollowingUser(qbb, ':meId', 'note.userId')
							// Mentions me
							.orWhere(':meIdAsList <@ note.mentions')
							// Reply to me
							.orWhere(':meId = note.replyUserId')))
						.andWhere('note.visibility = \'followers\'')));

				q.setParameters({ meId: me.id, meIdAsList: [me.id] });
			}
		}));
	}

	@bindThis
	public generateMutedUserRenotesQueryForNotes<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me: { id: MiUser['id'] }): SelectQueryBuilder<E> {
		return q
			.andWhere(new Brackets(qb => this
				.orNotMutingRenote(qb, ':meId', 'note.userId')
				.orWhere('note.renoteId IS NULL')
				.orWhere('note.text IS NOT NULL')
				.orWhere('note.cw IS NOT NULL')
				.orWhere('note.replyId IS NOT NULL')
				.orWhere('note.hasPoll = true')
				.orWhere('note.fileIds != \'{}\'')))
			.setParameters({ meId: me.id });
	}

	@bindThis
	public generateExcludedRenotesQueryForNotes<Q extends WhereExpressionBuilder>(q: Q): Q {
		return this.andIsNotRenote(q, 'note');
	}

	@bindThis
	public generateBlockedHostQueryForNote<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, excludeAuthor?: boolean): SelectQueryBuilder<E> {
		const checkFor = (key: 'user' | 'replyUser' | 'renoteUser') => this
			.leftJoinInstance(q, `note.${key}Instance`, `${key}Instance`)
			.andWhere(new Brackets(qb => {
				qb
					.orWhere(`"${key}Instance" IS NULL`) // local
					.orWhere(`"${key}Instance"."isBlocked" = false`); // not blocked

				if (excludeAuthor) {
					qb.orWhere(`note.userId = note.${key}Id`); // author
				}
			}));

		if (!excludeAuthor) {
			checkFor('user');
		}
		checkFor('replyUser');
		checkFor('renoteUser');

		return q;
	}

	@bindThis
	public generateSilencedUserQueryForNotes<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me?: { id: MiUser['id'] } | null): SelectQueryBuilder<E> {
		if (!me) {
			return q.andWhere('user.isSilenced = false');
		}

		return this
			.leftJoinInstance(q, 'note.userInstance', 'userInstance')
			.andWhere(new Brackets(qb => this
				// case 1: we are following the user
				.orFollowingUser(qb, ':meId', 'note.userId')
				// case 2: user not silenced AND instance not silenced
				.orWhere(new Brackets(qbb => qbb
					.andWhere(new Brackets(qbbb => qbbb
						.orWhere('"userInstance"."isSilenced" = false')
						.orWhere('"userInstance" IS NULL')))
					.andWhere('user.isSilenced = false')))))
			.setParameters({ meId: me.id });
	}

	/**
	 * Left-joins an instance in to the query with a given alias and optional condition.
	 * These calls are de-duplicated - multiple uses of the same alias are skipped.
	 */
	@bindThis
	public leftJoinInstance<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, relation: string | typeof MiInstance, alias: string, condition?: string): SelectQueryBuilder<E> {
		// Skip if it's already joined, otherwise we'll get an error
		if (!q.expressionMap.joinAttributes.some(j => j.alias.name === alias)) {
			q.leftJoin(relation, alias, condition);
		}

		return q;
	}

	/**
	 * Adds OR condition that noteProp (note ID) refers to a quote.
	 * The prop should be an expression, not a raw value.
	 */
	@bindThis
	public orIsQuote<Q extends WhereExpressionBuilder>(q: Q, noteProp: string): Q {
		return this.addIsQuote(q, noteProp, 'orWhere');
	}

	/**
	 * Adds AND condition that noteProp (note ID) refers to a quote.
	 * The prop should be an expression, not a raw value.
	 */
	@bindThis
	public andIsQuote<Q extends WhereExpressionBuilder>(q: Q, noteProp: string): Q {
		return this.addIsQuote(q, noteProp, 'andWhere');
	}

	private addIsQuote<Q extends WhereExpressionBuilder>(q: Q, noteProp: string, join: 'andWhere' | 'orWhere'): Q {
		return q[join](new Brackets(qb => qb
			.andWhere(`${noteProp}.renoteId IS NOT NULL`)
			.andWhere(new Brackets(qbb => qbb
				.orWhere(`${noteProp}.text IS NOT NULL`)
				.orWhere(`${noteProp}.cw IS NOT NULL`)
				.orWhere(`${noteProp}.replyId IS NOT NULL`)
				.orWhere(`${noteProp}.hasPoll = true`)
				.orWhere(`${noteProp}.fileIds != '{}'`)))));
	}

	/**
	 * Adds OR condition that noteProp (note ID) does not refer to a quote.
	 * The prop should be an expression, not a raw value.
	 */
	@bindThis
	public orIsNotQuote<Q extends WhereExpressionBuilder>(q: Q, noteProp: string): Q {
		return this.addIsNotQuote(q, noteProp, 'orWhere');
	}

	/**
	 * Adds AND condition that noteProp (note ID) does not refer to a quote.
	 * The prop should be an expression, not a raw value.
	 */
	@bindThis
	public andIsNotQuote<Q extends WhereExpressionBuilder>(q: Q, noteProp: string): Q {
		return this.addIsNotQuote(q, noteProp, 'andWhere');
	}

	private addIsNotQuote<Q extends WhereExpressionBuilder>(q: Q, noteProp: string, join: 'andWhere' | 'orWhere'): Q {
		return q[join](new Brackets(qb => qb
			.orWhere(`${noteProp}.renoteId IS NULL`)
			.orWhere(new Brackets(qb => qb
				.andWhere(`${noteProp}.text IS NULL`)
				.andWhere(`${noteProp}.cw IS NULL`)
				.andWhere(`${noteProp}.replyId IS NULL`)
				.andWhere(`${noteProp}.hasPoll = false`)
				.andWhere(`${noteProp}.fileIds = '{}'`)))));
	}

	/**
	 * Adds OR condition that noteProp (note ID) refers to a renote.
	 * The prop should be an expression, not a raw value.
	 */
	@bindThis
	public orIsRenote<Q extends WhereExpressionBuilder>(q: Q, noteProp: string): Q {
		return this.addIsRenote(q, noteProp, 'orWhere');
	}

	/**
	 * Adds AND condition that noteProp (note ID) refers to a renote.
	 * The prop should be an expression, not a raw value.
	 */
	@bindThis
	public andIsRenote<Q extends WhereExpressionBuilder>(q: Q, noteProp: string): Q {
		return this.addIsRenote(q, noteProp, 'andWhere');
	}

	private addIsRenote<Q extends WhereExpressionBuilder>(q: Q, noteProp: string, join: 'andWhere' | 'orWhere'): Q {
		return q[join](new Brackets(qb => qb
			.andWhere(`${noteProp}.renoteId IS NOT NULL`)
			.andWhere(`${noteProp}.text IS NULL`)
			.andWhere(`${noteProp}.cw IS NULL`)
			.andWhere(`${noteProp}.replyId IS NULL`)
			.andWhere(`${noteProp}.hasPoll = false`)
			.andWhere(`${noteProp}.fileIds = '{}'`)));
	}

	/**
	 * Adds OR condition that noteProp (note ID) does not refer to a renote.
	 * The prop should be an expression, not a raw value.
	 */
	@bindThis
	public orIsNotRenote<Q extends WhereExpressionBuilder>(q: Q, noteProp: string): Q {
		return this.addIsNotRenote(q, noteProp, 'orWhere');
	}

	/**
	 * Adds AND condition that noteProp (note ID) does not refer to a renote.
	 * The prop should be an expression, not a raw value.
	 */
	@bindThis
	public andIsNotRenote<Q extends WhereExpressionBuilder>(q: Q, noteProp: string): Q {
		return this.addIsNotRenote(q, noteProp, 'andWhere');
	}

	private addIsNotRenote<Q extends WhereExpressionBuilder>(q: Q, noteProp: string, join: 'andWhere' | 'orWhere'): Q {
		return q[join](new Brackets(qb => qb
			.orWhere(`${noteProp}.renoteId IS NULL`)
			.orWhere(`${noteProp}.text IS NOT NULL`)
			.orWhere(`${noteProp}.cw IS NOT NULL`)
			.orWhere(`${noteProp}.replyId IS NOT NULL`)
			.orWhere(`${noteProp}.hasPoll = true`)
			.orWhere(`${noteProp}.fileIds != '{}'`)));
	}

	/**
	 * Adds OR condition that followerProp (user ID) is following followeeProp (user ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public orFollowingUser<Q extends WhereExpressionBuilder>(q: Q, followerProp: string, followeeProp: string): Q {
		return this.addFollowingUser(q, followerProp, followeeProp, 'orWhere');
	}

	/**
	 * Adds AND condition that followerProp (user ID) is following followeeProp (user ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public andFollowingUser<Q extends WhereExpressionBuilder>(q: Q, followerProp: string, followeeProp: string): Q {
		return this.addFollowingUser(q, followerProp, followeeProp, 'andWhere');
	}

	private addFollowingUser<Q extends WhereExpressionBuilder>(q: Q, followerProp: string, followeeProp: string, join: 'andWhere' | 'orWhere'): Q {
		const followingQuery = this.followingsRepository.createQueryBuilder('following')
			.select('1')
			.andWhere(`following.followerId = ${followerProp}`)
			.andWhere(`following.followeeId = ${followeeProp}`);

		return q[join](`EXISTS (${followingQuery.getQuery()})`, followingQuery.getParameters());
	};

	/**
	 * Adds OR condition that followerProp (user ID) is following followeeProp (channel ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public orFollowingChannel<Q extends WhereExpressionBuilder>(q: Q, followerProp: string, followeeProp: string): Q {
		return this.addFollowingChannel(q, followerProp, followeeProp, 'orWhere');
	}

	/**
	 * Adds AND condition that followerProp (user ID) is following followeeProp (channel ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public andFollowingChannel<Q extends WhereExpressionBuilder>(q: Q, followerProp: string, followeeProp: string): Q {
		return this.addFollowingChannel(q, followerProp, followeeProp, 'andWhere');
	}

	private addFollowingChannel<Q extends WhereExpressionBuilder>(q: Q, followerProp: string, followeeProp: string, join: 'andWhere' | 'orWhere'): Q {
		const followingQuery = this.channelFollowingsRepository.createQueryBuilder('following')
			.select('1')
			.andWhere(`following.followerId = ${followerProp}`)
			.andWhere(`following.followeeId = ${followeeProp}`);

		return q[join](`EXISTS (${followingQuery.getQuery()})`, followingQuery.getParameters());
	}

	/**
	 * Adds OR condition that blockerProp (user ID) is not blocking blockeeProp (user ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public orNotBlockingUser<Q extends WhereExpressionBuilder>(q: Q, blockerProp: string, blockeeProp: string): Q {
		return this.excludeBlockingUser(q, blockerProp, blockeeProp, 'orWhere');
	}

	/**
	 * Adds AND condition that blockerProp (user ID) is not blocking blockeeProp (user ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public andNotBlockingUser<Q extends WhereExpressionBuilder>(q: Q, blockerProp: string, blockeeProp: string): Q {
		return this.excludeBlockingUser(q, blockerProp, blockeeProp, 'andWhere');
	}

	private excludeBlockingUser<Q extends WhereExpressionBuilder>(q: Q, blockerProp: string, blockeeProp: string, join: 'andWhere' | 'orWhere'): Q {
		const blockingQuery = this.blockingsRepository.createQueryBuilder('blocking')
			.select('1')
			.andWhere(`blocking.blockerId = ${blockerProp}`)
			.andWhere(`blocking.blockeeId = ${blockeeProp}`);

		return q[join](`NOT EXISTS (${blockingQuery.getQuery()})`, blockingQuery.getParameters());
	};

	/**
	 * Adds OR condition that muterProp (user ID) is not muting muteeProp (user ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public orNotMutingUser<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string, exclude?: { id: MiUser['id'] }): Q {
		return this.excludeMutingUser(q, muterProp, muteeProp, 'orWhere', exclude);
	}

	/**
	 * Adds AND condition that muterProp (user ID) is not muting muteeProp (user ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public andNotMutingUser<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string, exclude?: { id: MiUser['id'] }): Q {
		return this.excludeMutingUser(q, muterProp, muteeProp, 'andWhere', exclude);
	}

	private excludeMutingUser<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string, join: 'andWhere' | 'orWhere', exclude?: { id: MiUser['id'] }): Q {
		const mutingQuery = this.mutingsRepository.createQueryBuilder('muting')
			.select('1')
			.andWhere(`muting.muterId = ${muterProp}`)
			.andWhere(`muting.muteeId = ${muteeProp}`);

		if (exclude) {
			mutingQuery.andWhere({ muteeId: Not(exclude.id) });
		}

		return q[join](`NOT EXISTS (${mutingQuery.getQuery()})`, mutingQuery.getParameters());
	}

	/**
	 * Adds OR condition that muterProp (user ID) is not muting renotes by muteeProp (user ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public orNotMutingRenote<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string): Q {
		return this.excludeMutingRenote(q, muterProp, muteeProp, 'orWhere');
	}

	/**
	 * Adds AND condition that muterProp (user ID) is not muting renotes by muteeProp (user ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public andNotMutingRenote<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string): Q {
		return this.excludeMutingRenote(q, muterProp, muteeProp, 'andWhere');
	}

	private excludeMutingRenote<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string, join: 'andWhere' | 'orWhere'): Q {
		const mutingQuery = this.renoteMutingsRepository.createQueryBuilder('renote_muting')
			.select('1')
			.andWhere(`renote_muting.muterId = ${muterProp}`)
			.andWhere(`renote_muting.muteeId = ${muteeProp}`);

		return q[join](`NOT EXISTS (${mutingQuery.getQuery()})`, mutingQuery.getParameters());
	};

	/**
	 * Adds OR condition that muterProp (user ID) is not muting muteeProp (instance host).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public orNotMutingInstance<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string): Q {
		return this.excludeMutingInstance(q, muterProp, muteeProp, 'orWhere');
	}

	/**
	 * Adds AND condition that muterProp (user ID) is not muting muteeProp (instance host).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public andNotMutingInstance<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string): Q {
		return this.excludeMutingInstance(q, muterProp, muteeProp, 'andWhere');
	}

	private excludeMutingInstance<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string, join: 'andWhere' | 'orWhere'): Q {
		const mutingInstanceQuery = this.userProfilesRepository.createQueryBuilder('user_profile')
			.select('1')
			.andWhere(`user_profile.userId = ${muterProp}`)
			.andWhere(`"user_profile"."mutedInstances"::jsonb ? ${muteeProp}`);

		return q[join](`NOT EXISTS (${mutingInstanceQuery.getQuery()})`, mutingInstanceQuery.getParameters());
	}

	/**
	 * Adds OR condition that muterProp (user ID) is not muting muteeProp (note ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public orNotMutingThread<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string): Q {
		return this.excludeMutingThread(q, muterProp, muteeProp, 'orWhere');
	}

	/**
	 * Adds AND condition that muterProp (user ID) is not muting muteeProp (note ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public andNotMutingThread<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string): Q {
		return this.excludeMutingThread(q, muterProp, muteeProp, 'andWhere');
	}

	private excludeMutingThread<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string, join: 'andWhere' | 'orWhere'): Q {
		const threadMutedQuery = this.noteThreadMutingsRepository.createQueryBuilder('threadMuted')
			.select('1')
			.andWhere(`threadMuted.userId = ${muterProp}`)
			.andWhere(`threadMuted.threadId = ${muteeProp}`);

		return q[join](`NOT EXISTS (${threadMutedQuery.getQuery()})`, threadMutedQuery.getParameters());
	}

	// Requirements: user replyUser renoteUser must be joined
	@bindThis
	public generateSuspendedUserQueryForNote(q: SelectQueryBuilder<any>, excludeAuthor?: boolean): void {
		if (excludeAuthor) {
			const brakets = (user: string) => new Brackets(qb => qb
				.where(`note.${user}Id IS NULL`)
				.orWhere(`user.id = ${user}.id`)
				.orWhere(`${user}.isSuspended = FALSE`));
			q
				.andWhere(brakets('replyUser'))
				.andWhere(brakets('renoteUser'));
		} else {
			const brakets = (user: string) => new Brackets(qb => qb
				.where(`note.${user}Id IS NULL`)
				.orWhere(`${user}.isSuspended = FALSE`));
			q
				.andWhere('user.isSuspended = FALSE')
				.andWhere(brakets('replyUser'))
				.andWhere(brakets('renoteUser'));
		}
	}
}
