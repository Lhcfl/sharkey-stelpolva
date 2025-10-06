/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets, Not, QueryBuilder, WhereExpressionBuilder } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { MiUser } from '@/models/User.js';
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

	/**
	 * Exclude replies from the queries, used for timelines.
	 * withRepliesProp can be specified to additionally allow replies when a given property is true.
	 * Must match logic NoteVisibilityService.shouldSilenceForFollowWithoutReplies.
	 */
	@bindThis
	public generateExcludedRepliesQueryForNotes<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me?: { id: MiUser['id'] } | null, withRepliesProp?: string): SelectQueryBuilder<E> {
		return q
			.andWhere(new Brackets(qb => {
				if (withRepliesProp) {
					// Allow if query specifies it
					qb.orWhere(`${withRepliesProp} = true`);
				}

				return this
					// Allow if we're following w/ replies
					.orFollowingUser(qb, ':meId', 'note.userId', true)
					// Allow if it's not a reply
					.orWhere('note.replyId IS NULL') // 返信ではない
					// Allow if it's a self-reply (user replied to themself)
					.orWhere('note.replyUserId = note.userId')
					// Allow if it's a reply to me
					.orWhere('note.replyUserId = :meId')
					// Allow if it's my reply
					.orWhere('note.userId = :meId');
			}))
			.setParameters({ meId: me?.id ?? null });
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

	// 无论如何都允许查看自己的帖子
	@bindThis
	public generateLooseBlockedUserQueryForNotes<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me: { id: MiUser['id'] }): SelectQueryBuilder<E> {
		return q.andWhere(new Brackets(qb => qb
			.orWhere('note.userId = :meId')
			.orWhere(
				new Brackets(qb => this
					.andNotBlockingUser(qb, 'note.userId', ':meId')
					.andWhere(new Brackets(qb => this
						.orNotBlockingUser(qb, 'note.replyUserId', ':meId')
						.orWhere('note.replyUserId IS NULL')))
					.andWhere(new Brackets(qb => this
						.orNotBlockingUser(qb, 'note.renoteUserId', ':meId')
						.orWhere('note.renoteUserId IS NULL')))))))
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
		// Muted thread
		this.andNotMutingThread(q, ':meId', 'coalesce(note.threadId, note.id)');

		// Muted note
		this.andNotMutingNote(q, ':meId', 'note.id');

		q.andWhere(new Brackets(qb => qb
			.orWhere('note.renoteId IS NULL')
			.orWhere(new Brackets(qbb => {
				// Renote muted thread
				this.andNotMutingThread(qbb, ':meId', 'coalesce(renote.threadId, renote.id)');

				// Renote muted note
				this.andNotMutingNote(qbb, ':meId', 'renote.id');
			}))));

		return this
			.leftJoin(q, 'note.renote', 'renote')
			.setParameters({ meId: me.id });
	}

	@bindThis
	public generateMutedUserQueryForNotes<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me: { id: MiUser['id'] }, excludeAuthor = false): SelectQueryBuilder<E> {
		if (!excludeAuthor) {
			this
				// muted user
				.andNotMutingUser(q, ':meId', 'note.userId')
				// muted host
				.andWhere(new Brackets(qb => {
					qb.orWhere('note.userHost IS NULL');
					this.orFollowingUser(qb, ':meId', 'note.userId');
					this.orNotMutingInstance(qb, ':meId', 'note.userHost');
				}));
		}

		return q
			// muted reply user
			.andWhere(new Brackets(qb => this
				.orNotMutingUser(qb, ':meId', 'note.replyUserId')
				.orWhere('note.replyUserId = note.userId')
				.orWhere('note.replyUserId IS NULL')))
			// muted renote user
			.andWhere(new Brackets(qb => this
				.orNotMutingUser(qb, ':meId', 'note.renoteUserId')
				.orWhere('note.renoteUserId = note.userId')
				.orWhere('note.renoteUserId IS NULL')))
			// muted reply host
			.andWhere(new Brackets(qb => {
				qb.orWhere('note.replyUserHost IS NULL');
				qb.orWhere('note.replyUserHost = note.userHost');
				this.orFollowingUser(qb, ':meId', 'note.replyUserId');
				this.orNotMutingInstance(qb, ':meId', 'note.replyUserHost');
			}))
			// muted renote host
			.andWhere(new Brackets(qb => {
				qb.orWhere('note.renoteUserHost IS NULL');
				qb.orWhere('note.renoteUserHost = note.userHost');
				this.orFollowingUser(qb, ':meId', 'note.renoteUserId');
				this.orNotMutingInstance(qb, ':meId', 'note.renoteUserHost');
			}))
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
		// This code must always be synchronized with the checks in NoteEntityService.isVisibleForMe.
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
			.leftJoin(q, `note.${key}Instance`, `${key}Instance`)
			.andWhere(new Brackets(qb => {
				qb
					.orWhere(`"${key}Instance" IS NULL`) // local
					.orWhere(`"${key}Instance"."isBlocked" = false`); // not blocked

				if (key !== 'user') {
					// Don't re-check self-replies and self-renote targets
					qb.orWhere(`note.userId = note.${key}Id`);
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
	public generateSilencedUserQueryForNotes<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, me?: { id: MiUser['id'] } | null, excludeAuthor = false): SelectQueryBuilder<E> {
		const checkFor = (key: 'user' | 'replyUser' | 'renoteUser', userKey: 'note.user' | 'reply.user' | 'renote.user') => {
			// These are de-duplicated, since most call sites already provide some of them.
			this.leftJoin(q, `note.${key}Instance`, `${key}Instance`); // note->instance
			this.leftJoin(q, userKey, key); // note->user

			q.andWhere(new Brackets(qb => {
				// case 1: user does not exist (note is not reply/renote)
				qb.orWhere(`note.${key}Id IS NULL`);

				// case 2: user not silenced AND (instance not silenced OR instance is local)
				qb.orWhere(new Brackets(qbb => qbb
					.andWhere(`"${key}"."isSilenced" = false`)
					.andWhere(new Brackets(qbbb => qbbb
						.orWhere(`"${key}Instance"."isSilenced" = false`)
						.orWhere(`"note"."${key}Host" IS NULL`)))));

				if (me) {
					// case 3: we are the author
					qb.orWhere(`note.${key}Id = :meId`);

					// case 4: we are following the user
					this.orFollowingUser(qb, ':meId', `note.${key}Id`);
				}

				// case 5: user is the same
				if (key !== 'user') {
					qb.orWhere(`note.${key}Id = note.userId`);
				}
			}));
		};

		const checkForRenote = (_q: WhereExpressionBuilder, key: 'replyUser' | 'renoteUser', userRel: 'renoteReply.user' | 'renoteRenote.user', userAlias: 'renoteReplyUser' | 'renoteRenoteUser') => {
			const instanceAlias = `${userAlias}Instance`;
			this.leftJoin(q, `renote.${key}Instance`, instanceAlias); // note->instance
			this.leftJoin(q, userRel, userAlias); // note->user

			_q.andWhere(new Brackets(qb => {
				// case 1: user does not exist (note is not reply/renote)
				qb.orWhere(`renote.${key}Id IS NULL`);

				// case 2: user not silenced AND (instance not silenced OR instance is local)
				qb.orWhere(new Brackets(qbb => qbb
					.andWhere(`"${userAlias}"."isSilenced" = false`)
					.andWhere(new Brackets(qbbb => qbbb
						.orWhere(`"${instanceAlias}"."isSilenced" = false`)
						.orWhere(`"renote"."${key}Host" IS NULL`)))));

				if (me) {
					// case 3: we are the author
					qb.orWhere(`renote.${key}Id = :meId`);

					// case 4: we are following the user
					this.orFollowingUser(qb, ':meId', `renote.${key}Id`);
				}

				// case 5: user is the same
				qb.orWhere(`renote.${key}Id = renote.userId`);
			}));
		};

		// Set parameters only once
		if (me) {
			q.setParameters({ meId: me.id });
		}

		if (!excludeAuthor) {
			checkFor('user', 'note.user');
		}
		checkFor('replyUser', 'reply.user');
		checkFor('renoteUser', 'renote.user');

		// Filter for boosts
		this.leftJoin(q, 'renote.reply', 'renoteReply');
		this.leftJoin(q, 'renote.renote', 'renoteRenote');
		q.andWhere(new Brackets(qb => this
			.orIsNotRenote(qb, 'note')
			.orWhere(new Brackets(qbb => {
				checkForRenote(qbb, 'replyUser', 'renoteReply.user', 'renoteReplyUser');
				checkForRenote(qbb, 'renoteUser', 'renoteRenote.user', 'renoteRenoteUser');
			}))));

		return q;
	}

	/**
	 * Left-joins a relation into the query with a given alias and optional condition.
	 * These calls are de-duplicated - multiple uses of the same relation+alias are skipped.
	 */
	@bindThis
	public leftJoin<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, relation: string, alias: string, condition?: string): SelectQueryBuilder<E> {
		// Skip if it's already joined, otherwise we'll get an error
		const join = q.expressionMap.joinAttributes.find(j => j.alias.name === alias);
		if (join) {
			const oldRelation = typeof(join.entityOrProperty) === 'function'
				? join.entityOrProperty.name
				: join.entityOrProperty;

			const oldQuery = join.condition
				? `JOIN ${oldRelation} AS ${alias} ON ${join.condition}`
				: `JOIN ${oldRelation} AS ${alias}`;
			const newQuery = condition
				? `JOIN ${relation} AS ${alias} ON ${oldRelation}`
				: `JOIN ${relation} AS ${alias}`;

			if (oldRelation !== relation) {
				throw new Error(`Query error: cannot add ${newQuery}: alias already used by ${oldQuery}`);
			}

			if (join.condition !== condition) {
				throw new Error(`Query error: cannot add ${newQuery}: relation already defined with different condition by ${oldQuery}`);
			}
		} else {
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
	 * If withReplies is set to a boolean, then this method will only count followings with the matching withReplies value.
	 */
	@bindThis
	public orFollowingUser<Q extends WhereExpressionBuilder>(q: Q, followerProp: string, followeeProp: string, withReplies?: boolean): Q {
		return this.addFollowingUser(q, followerProp, followeeProp, 'orWhere', withReplies);
	}

	/**
	 * Adds AND condition that followerProp (user ID) is following followeeProp (user ID).
	 * Both props should be expressions, not raw values.
	 * If withReplies is set to a boolean, then this method will only count followings with the matching withReplies value.
	 */
	@bindThis
	public andFollowingUser<Q extends WhereExpressionBuilder>(q: Q, followerProp: string, followeeProp: string, withReplies?: boolean): Q {
		return this.addFollowingUser(q, followerProp, followeeProp, 'andWhere', withReplies);
	}

	private addFollowingUser<Q extends WhereExpressionBuilder>(q: Q, followerProp: string, followeeProp: string, join: 'andWhere' | 'orWhere', withReplies?: boolean): Q {
		const followingQuery = this.followingsRepository.createQueryBuilder('following')
			.select('1')
			.andWhere(`following.followerId = ${followerProp}`)
			.andWhere(`following.followeeId = ${followeeProp}`);

		if (withReplies !== undefined) {
			followingQuery.andWhere('following.withReplies = :withReplies', { withReplies });
		}

		return q[join](`EXISTS (${followingQuery.getQuery()})`, followingQuery.getParameters());
	};

	/**
	 * Adds AND condition that followerProp (user ID) is following followeeProp (user ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public andFollowingWithReply<Q extends WhereExpressionBuilder>(q: Q, followerProp: string, followeeProp: string): Q {
		return this.addFollowingWithReply(q, followerProp, followeeProp, 'andWhere');
	}

	private addFollowingWithReply<Q extends WhereExpressionBuilder>(q: Q, followerProp: string, followeeProp: string, join: 'andWhere' | 'orWhere'): Q {
		const followingQuery = this.followingsRepository.createQueryBuilder('following')
			.select('1')
			.andWhere(`following.followerId = ${followerProp}`)
			.andWhere(`following.followeeId = ${followeeProp}`)
			.andWhere('following.withReplies = true');

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
			.andWhere(`threadMuted.threadId = ${muteeProp}`)
			.andWhere('threadMuted.isPostMute = false');

		return q[join](`NOT EXISTS (${threadMutedQuery.getQuery()})`, threadMutedQuery.getParameters());
	}

	/**
	 * Adds OR condition that muterProp (user ID) is not muting muteeProp (note ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public orNotMutingNote<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string): Q {
		return this.excludeMutingNote(q, muterProp, muteeProp, 'orWhere');
	}

	/**
	 * Adds AND condition that muterProp (user ID) is not muting muteeProp (note ID).
	 * Both props should be expressions, not raw values.
	 */
	@bindThis
	public andNotMutingNote<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string): Q {
		return this.excludeMutingNote(q, muterProp, muteeProp, 'andWhere');
	}

	private excludeMutingNote<Q extends WhereExpressionBuilder>(q: Q, muterProp: string, muteeProp: string, join: 'andWhere' | 'orWhere'): Q {
		const threadMutedQuery = this.noteThreadMutingsRepository.createQueryBuilder('threadMuted')
			.select('1')
			.andWhere(`threadMuted.userId = ${muterProp}`)
			.andWhere(`threadMuted.threadId = ${muteeProp}`)
			.andWhere('threadMuted.isPostMute = true');

		return q[join](`NOT EXISTS (${threadMutedQuery.getQuery()})`, threadMutedQuery.getParameters());
	}

	@bindThis
	public generateSuspendedUserQueryForNote<E extends ObjectLiteral>(q: SelectQueryBuilder<E>, excludeAuthor?: boolean): void {
		this.leftJoin(q, 'note.user', 'user');
		this.leftJoin(q, 'note.reply', 'reply');
		this.leftJoin(q, 'note.renote', 'renote');
		this.leftJoin(q, 'reply.user', 'replyUser');
		this.leftJoin(q, 'renote.user', 'renoteUser');

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
