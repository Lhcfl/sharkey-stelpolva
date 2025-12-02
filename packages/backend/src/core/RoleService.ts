/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { In } from 'typeorm';
import { ModuleRef } from '@nestjs/core';
import Ajv from 'ajv';
import type {
	MiMeta,
	MiRole,
	MiRoleAssignment,
	RoleAssignmentsRepository,
	RolesRepository,
	UsersRepository,
} from '@/models/_.js';
import { MemoryKVCache, MemorySingleCache } from '@/misc/cache.js';
import type { MiUser } from '@/models/User.js';
import { isLocalUser, isRemoteUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { CacheService, FollowStats } from '@/core/CacheService.js';
import type { RoleCondFormulaValue } from '@/models/Role.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { IdService } from '@/core/IdService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import type { Packed } from '@/misc/json-schema.js';
import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import type { NotificationService } from '@/core/NotificationService.js';
import { TimeService } from '@/global/TimeService.js';
import {
	CacheManagementService,
	type ManagedMemorySingleCache,
	type ManagedMemoryKVCache,
} from '@/global/CacheManagementService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { getCallerId } from '@/misc/attach-caller-id.js';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import type { JSONSchemaType, ValidateFunction } from 'ajv';

export type RolePolicies = {
	gtlAvailable: boolean;
	ltlAvailable: boolean;
	btlAvailable: boolean;
	canPublicNote: boolean;
	scheduleNoteMax: number;
	mentionLimit: number;
	canInvite: boolean;
	inviteLimit: number;
	inviteLimitCycle: number;
	inviteExpirationTime: number;
	canManageCustomEmojis: boolean;
	canManageAvatarDecorations: boolean;
	canSearchNotes: boolean;
	canUseTranslator: boolean;
	canHideAds: boolean;
	driveCapacityMb: number;
	maxFileSizeMb: number;
	alwaysMarkNsfw: boolean;
	canUpdateBioMedia: boolean;
	pinLimit: number;
	antennaLimit: number;
	wordMuteLimit: number;
	webhookLimit: number;
	clipLimit: number;
	noteEachClipsLimit: number;
	userListLimit: number;
	userEachUserListsLimit: number;
	rateLimitFactor: number;
	canImportNotes: boolean;
	avatarDecorationLimit: number;
	canImportAntennas: boolean;
	canImportBlocking: boolean;
	canImportFollowing: boolean;
	canImportMuting: boolean;
	canImportUserLists: boolean;
	chatAvailability: 'available' | 'readonly' | 'unavailable';
	canTrend: boolean;
	canViewFederation: boolean;
};

export const DEFAULT_POLICIES: RolePolicies = {
	gtlAvailable: true,
	ltlAvailable: true,
	btlAvailable: false,
	canPublicNote: true,
	scheduleNoteMax: 5,
	mentionLimit: 20,
	canInvite: false,
	inviteLimit: 0,
	inviteLimitCycle: 60 * 24 * 7,
	inviteExpirationTime: 0,
	canManageCustomEmojis: false,
	canManageAvatarDecorations: false,
	canSearchNotes: false,
	canUseTranslator: false,
	canHideAds: false,
	driveCapacityMb: 100,
	maxFileSizeMb: 25,
	alwaysMarkNsfw: false,
	canUpdateBioMedia: true,
	pinLimit: 5,
	antennaLimit: 5,
	wordMuteLimit: 1000,
	webhookLimit: 3,
	clipLimit: 10,
	noteEachClipsLimit: 200,
	userListLimit: 10,
	userEachUserListsLimit: 50,
	rateLimitFactor: 1,
	canImportNotes: true,
	avatarDecorationLimit: 1,
	canImportAntennas: true,
	canImportBlocking: true,
	canImportFollowing: true,
	canImportMuting: true,
	canImportUserLists: true,
	chatAvailability: 'available',
	canTrend: true,
	canViewFederation: true,
};

// TODO cache sync fixes (and maybe events too?)

const DefaultPoliciesSchema: JSONSchemaType<RolePolicies> = {
	type: 'object',
	additionalProperties: false,
	required: [],
	properties: {
		gtlAvailable: { type: 'boolean' },
		ltlAvailable: { type: 'boolean' },
		btlAvailable: { type: 'boolean' },
		canPublicNote: { type: 'boolean' },
		scheduleNoteMax: { type: 'integer', minimum: 0 },
		mentionLimit: { type: 'integer', minimum: 0 },
		canInvite: { type: 'boolean' },
		inviteLimit: { type: 'integer', minimum: 0 },
		inviteLimitCycle: { type: 'integer', minimum: 0 },
		inviteExpirationTime: { type: 'integer', minimum: 0 },
		canManageCustomEmojis: { type: 'boolean' },
		canManageAvatarDecorations: { type: 'boolean' },
		canSearchNotes: { type: 'boolean' },
		canUseTranslator: { type: 'boolean' },
		canHideAds: { type: 'boolean' },

		// these can be less than 1 MB
		// (test/unit/server/api/drive/files/create.ts depends on this)
		driveCapacityMb: { type: 'number', minimum: 0 },
		maxFileSizeMb: { type: 'number', minimum: 0 },

		alwaysMarkNsfw: { type: 'boolean' },
		canUpdateBioMedia: { type: 'boolean' },
		pinLimit: { type: 'integer', minimum: 0 },
		antennaLimit: { type: 'integer', minimum: 0 },
		wordMuteLimit: { type: 'integer', minimum: 0 },
		webhookLimit: { type: 'integer', minimum: 0 },
		clipLimit: { type: 'integer', minimum: 0 },
		noteEachClipsLimit: { type: 'integer', minimum: 0 },
		userListLimit: { type: 'integer', minimum: 0 },
		userEachUserListsLimit: { type: 'integer', minimum: 0 },
		rateLimitFactor: { type: 'number', minimum: 0.01 },
		canImportNotes: { type: 'boolean' },
		avatarDecorationLimit: { type: 'integer', minimum: 0 },
		canImportAntennas: { type: 'boolean' },
		canImportBlocking: { type: 'boolean' },
		canImportFollowing: { type: 'boolean' },
		canImportMuting: { type: 'boolean' },
		canImportUserLists: { type: 'boolean' },
		chatAvailability: { type: 'string', enum: ['available', 'readonly', 'unavailable'] },
		canTrend: { type: 'boolean' },
		canViewFederation: { type: 'boolean' },
	},
};

const RoleSchema: JSONSchemaType<MiRole['policies']> = {
	type: 'object',
	additionalProperties: false,
	required: [],
	properties: Object.fromEntries(
		Object.entries(DefaultPoliciesSchema.properties!).map(
			(
				// I picked `canTrend` here, but any policy name is fine, the
				// type of their bit of the schema is all the same
				[policy, value]: [string, JSONSchemaType<RolePolicies>['properties']['canTrend']]
			) => [
				policy,
				{
					type: 'object',
					additionalProperties: false,
					// we can't require `value` because the MiRole says `value:
					// any` which includes undefined, so technically `value` is
					// not really required
					required: ['priority', 'useDefault'],
					properties: {
						priority: { type: 'integer', minimum: 0, maximum: 2 },
						useDefault: { type: 'boolean' },
						value,
					},
				},
			],
		),
	),
};

@Injectable()
export class RoleService implements OnApplicationShutdown, OnModuleInit {
	private readonly rolesCache: ManagedMemorySingleCache<MiRole[]>;
	private readonly roleAssignmentByUserIdCache: ManagedMemoryKVCache<MiRoleAssignment[]>;

	private cacheService: CacheService;
	private notificationService: NotificationService;
	private defaultPoliciesValidator: ValidateFunction<RolePolicies>;
	private roleValidator: ValidateFunction<MiRole['policies']>;

	public static AlreadyAssignedError = class extends Error {};
	public static NotAssignedError = class extends Error {};

	constructor(
		private moduleRef: ModuleRef,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.rolesRepository)
		private rolesRepository: RolesRepository,

		@Inject(DI.roleAssignmentsRepository)
		private roleAssignmentsRepository: RoleAssignmentsRepository,

		private globalEventService: GlobalEventService,
		private idService: IdService,
		private moderationLogService: ModerationLogService,
		private fanoutTimelineService: FanoutTimelineService,
		private readonly timeService: TimeService,

		cacheManagementService: CacheManagementService,
	) {
		this.rolesCache = cacheManagementService.createMemorySingleCache<MiRole[]>('roles', 1000 * 60 * 60); // 1h
		this.roleAssignmentByUserIdCache = cacheManagementService.createMemoryKVCache<MiRoleAssignment[]>('roleAssignment', 1000 * 60 * 5); // 5m
		// TODO additional cache for final calculation?

		this.redisForSub.on('message', this.onMessage);

		// this is copied from server/api/endpoint-base.ts
		const ajv = new Ajv.default({
			useDefaults: true,
			allErrors: true,
		});
		this.defaultPoliciesValidator = ajv.compile(DefaultPoliciesSchema);
		this.roleValidator = ajv.compile(RoleSchema);
	}

	@bindThis
	async onModuleInit() {
		this.notificationService = this.moduleRef.get('NotificationService');
		this.cacheService = this.moduleRef.get('CacheService');
	}

	@bindThis
	private async onMessage(_: string, data: string): Promise<void> {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'roleCreated': {
					const cached = this.rolesCache.get();
					if (cached) {
						cached.push({
							...body,
							updatedAt: new Date(body.updatedAt),
							lastUsedAt: new Date(body.lastUsedAt),
						});
					}
					break;
				}
				case 'roleUpdated': {
					const cached = this.rolesCache.get();
					if (cached) {
						const i = cached.findIndex(x => x.id === body.id);
						if (i > -1) {
							cached[i] = {
								...body,
								updatedAt: new Date(body.updatedAt),
								lastUsedAt: new Date(body.lastUsedAt),
							};
						}
					}
					break;
				}
				case 'roleDeleted': {
					const cached = this.rolesCache.get();
					if (cached) {
						this.rolesCache.set(cached.filter(x => x.id !== body.id));
					}
					break;
				}
				case 'userRoleAssigned': {
					const cached = this.roleAssignmentByUserIdCache.get(body.userId);
					if (cached) {
						cached.push({ // TODO: このあたりのデシリアライズ処理は各modelファイル内に関数としてexportしたい
							...body,
							expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
							user: null, // joinなカラムは通常取ってこないので
							role: null, // joinなカラムは通常取ってこないので
						});
					}
					break;
				}
				case 'userRoleUnassigned': {
					const cached = this.roleAssignmentByUserIdCache.get(body.userId);
					if (cached) {
						this.roleAssignmentByUserIdCache.set(body.userId, cached.filter(x => x.id !== body.id));
					}
					break;
				}
				default:
					break;
			}
		}
	}

	@bindThis
	private evalCond(user: MiUser, roles: MiRole[], value: RoleCondFormulaValue, followStats: FollowStats): boolean {
		try {
			switch (value.type) {
				// ～かつ～
				case 'and': {
					return value.values.every(v => this.evalCond(user, roles, v, followStats));
				}
				// ～または～
				case 'or': {
					return value.values.some(v => this.evalCond(user, roles, v, followStats));
				}
				// ～ではない
				case 'not': {
					return !this.evalCond(user, roles, value.value, followStats);
				}
				// マニュアルロールがアサインされている
				case 'roleAssignedTo': {
					return roles.some(r => r.id === value.roleId);
				}
				// ローカルユーザのみ
				case 'isLocal': {
					return isLocalUser(user);
				}
				// リモートユーザのみ
				case 'isRemote': {
					return isRemoteUser(user);
				}
				// User is from a specific instance
				case 'isFromInstance': {
					if (user.host == null) {
						return false;
					}
					if (value.subdomains) {
						const userHost = '.' + user.host.toLowerCase();
						const targetHost = '.' + value.host.toLowerCase();
						return userHost.endsWith(targetHost);
					} else {
						return user.host.toLowerCase() === value.host.toLowerCase();
					}
				}
				// Is the user from a local bubble instance
				case 'fromBubbleInstance': {
					return user.host != null && this.meta.bubbleInstances.includes(user.host);
				}
				// サスペンド済みユーザである
				case 'isSuspended': {
					return user.isSuspended;
				}
				// 鍵アカウントユーザである
				case 'isLocked': {
					return user.isLocked;
				}
				// botユーザである
				case 'isBot': {
					return user.isBot;
				}
				// 猫である
				case 'isCat': {
					return user.isCat;
				}
				// 「ユーザを見つけやすくする」が有効なアカウント
				case 'isExplorable': {
					return user.isExplorable;
				}
				// ユーザが作成されてから指定期間経過した
				case 'createdLessThan': {
					return this.idService.parse(user.id).date.getTime() > (this.timeService.now - (value.sec * 1000));
				}
				// ユーザが作成されてから指定期間経っていない
				case 'createdMoreThan': {
					return this.idService.parse(user.id).date.getTime() < (this.timeService.now - (value.sec * 1000));
				}
				// フォロワー数が指定値以下
				case 'followersLessThanOrEq': {
					return user.followersCount <= value.value;
				}
				// フォロワー数が指定値以上
				case 'followersMoreThanOrEq': {
					return user.followersCount >= value.value;
				}
				// フォロー数が指定値以下
				case 'followingLessThanOrEq': {
					return user.followingCount <= value.value;
				}
				// フォロー数が指定値以上
				case 'followingMoreThanOrEq': {
					return user.followingCount >= value.value;
				}
				case 'localFollowersLessThanOrEq': {
					return followStats.localFollowers <= value.value;
				}
				case 'localFollowersMoreThanOrEq': {
					return followStats.localFollowers >= value.value;
				}
				case 'localFollowingLessThanOrEq': {
					return followStats.localFollowing <= value.value;
				}
				case 'localFollowingMoreThanOrEq': {
					return followStats.localFollowing >= value.value;
				}
				case 'remoteFollowersLessThanOrEq': {
					return followStats.remoteFollowers <= value.value;
				}
				case 'remoteFollowersMoreThanOrEq': {
					return followStats.remoteFollowers >= value.value;
				}
				case 'remoteFollowingLessThanOrEq': {
					return followStats.remoteFollowing <= value.value;
				}
				case 'remoteFollowingMoreThanOrEq': {
					return followStats.remoteFollowing >= value.value;
				}
				// ノート数が指定値以下
				case 'notesLessThanOrEq': {
					return user.notesCount <= value.value;
				}
				// ノート数が指定値以上
				case 'notesMoreThanOrEq': {
					return user.notesCount >= value.value;
				}
				default:
					return false;
			}
		} catch (err) {
			// TODO: log error
			return false;
		}
	}

	@bindThis
	public annotateCond(user: MiUser, roles: MiRole[], value: RoleCondFormulaValue, followStats: FollowStats, results: { [k: string]: boolean }): boolean {
		let result: boolean;
		try {
			switch (value.type) {
				case 'and': {
					result = true;
					// Don't use every(), since that short-circuits.
					// We need to run annotateCond() on every condition.
					value.values.forEach(v => result = this.annotateCond(user, roles, v, followStats, results) && result);
					break;
				}
				case 'or': {
					result = false;
					value.values.forEach(v => result = this.annotateCond(user, roles, v, followStats, results) || result);
					break;
				}
				case 'not': {
					result = !this.annotateCond(user, roles, value.value, followStats, results);
					break;
				}
				default: {
					result = this.evalCond(user, roles, value, followStats);
				}
			}
		} catch (err) {
			// TODO: log error
			result = false;
		}
		results[value.id] = result;
		return result;
	}

	@bindThis
	public async getRoles() {
		const roles = await this.rolesCache.fetch(() => this.rolesRepository.findBy({}));
		return roles;
	}

	@bindThis
	public async getUserAssigns(userOrId: MiUser | MiUser['id']) {
		const now = this.timeService.now;
		const userId = typeof(userOrId) === 'object' ? userOrId.id : userOrId;
		let assigns = await this.roleAssignmentByUserIdCache.fetch(userId, () => this.roleAssignmentsRepository.findBy({ userId }));
		// 期限切れのロールを除外
		assigns = assigns.filter(a => a.expiresAt == null || (a.expiresAt.getTime() > now));
		return assigns;
	}

	@bindThis
	public async getUserRoles(userOrId: MiUser | MiUser['id']) {
		const roles = await this.rolesCache.fetch(() => this.rolesRepository.findBy({}));
		const userId = typeof(userOrId) === 'object' ? userOrId.id : userOrId;
		const followStats = await this.cacheService.getFollowStats(userId);
		const assigns = await this.getUserAssigns(userOrId);
		const assignedRoles = roles.filter(r => assigns.map(x => x.roleId).includes(r.id));
		const user = typeof(userOrId) === 'object' ? userOrId : roles.some(r => r.target === 'conditional') ? await this.cacheService.findUserById(userOrId) : null;
		const matchedCondRoles = roles.filter(r => r.target === 'conditional' && this.evalCond(user!, assignedRoles, r.condFormula, followStats));

		let allRoles = [...assignedRoles, ...matchedCondRoles];

		// Check for dropped token permissions
		const rank = user ? getCallerId(user)?.accessToken?.rank : null;
		if (rank != null) {
			// Copy roles, since they come from a cache
			allRoles = allRoles.map(role => ({
				...role,
				isModerator: role.isModerator && (rank === 'admin' || rank === 'mod'),
				isAdministrator: role.isAdministrator && rank === 'admin',
			}));
		}

		return allRoles;
	}

	/**
	 * 指定ユーザーのバッジロール一覧取得
	 */
	@bindThis
	public async getUserBadgeRoles(userOrId: MiUser | MiUser['id']) {
		const now = this.timeService.now;
		const userId = typeof(userOrId) === 'object' ? userOrId.id : userOrId;
		let assigns = await this.roleAssignmentByUserIdCache.fetch(userId, () => this.roleAssignmentsRepository.findBy({ userId }));
		// 期限切れのロールを除外
		assigns = assigns.filter(a => a.expiresAt == null || (a.expiresAt.getTime() > now));
		const roles = await this.rolesCache.fetch(() => this.rolesRepository.findBy({}));
		const followStats = await this.cacheService.getFollowStats(userId);
		const assignedRoles = roles.filter(r => assigns.map(x => x.roleId).includes(r.id));
		const assignedBadgeRoles = assignedRoles.filter(r => r.asBadge);
		const badgeCondRoles = roles.filter(r => r.asBadge && (r.target === 'conditional'));
		if (badgeCondRoles.length > 0) {
			const user = typeof(userOrId) === 'object' ? userOrId : roles.some(r => r.target === 'conditional') ? await this.cacheService.findUserById(userOrId) : null;
			const matchedBadgeCondRoles = badgeCondRoles.filter(r => this.evalCond(user!, assignedRoles, r.condFormula, followStats));
			return [...assignedBadgeRoles, ...matchedBadgeCondRoles];
		} else {
			return assignedBadgeRoles;
		}
	}

	@bindThis
	public async getUserPolicies(userOrId: MiUser | MiUser['id'] | null): Promise<RolePolicies> {
		const basePolicies = { ...DEFAULT_POLICIES, ...this.meta.policies };

		if (userOrId == null) return basePolicies;

		const roles = await this.getUserRoles(userOrId);

		function calc<T extends keyof RolePolicies>(name: T, aggregate: (values: RolePolicies[T][]) => RolePolicies[T]) {
			if (roles.length === 0) return basePolicies[name];

			const policies = roles.map(role => role.policies[name] ?? { priority: 0, useDefault: true });

			const p2 = policies.filter(policy => policy.priority === 2);
			if (p2.length > 0) return aggregate(p2.map(policy => policy.useDefault ? basePolicies[name] : policy.value));

			const p1 = policies.filter(policy => policy.priority === 1);
			if (p1.length > 0) return aggregate(p1.map(policy => policy.useDefault ? basePolicies[name] : policy.value));

			return aggregate(policies.map(policy => policy.useDefault ? basePolicies[name] : policy.value));
		}

		function aggregateChatAvailability(vs: RolePolicies['chatAvailability'][]) {
			if (vs.some(v => v === 'available')) return 'available';
			if (vs.some(v => v === 'readonly')) return 'readonly';
			return 'unavailable';
		}

		return {
			gtlAvailable: calc('gtlAvailable', vs => vs.some(v => v === true)),
			btlAvailable: calc('btlAvailable', vs => vs.some(v => v === true)),
			ltlAvailable: calc('ltlAvailable', vs => vs.some(v => v === true)),
			canPublicNote: calc('canPublicNote', vs => vs.some(v => v === true)),
			scheduleNoteMax: calc('scheduleNoteMax', vs => Math.max(...vs)),
			mentionLimit: calc('mentionLimit', vs => Math.max(...vs)),
			canInvite: calc('canInvite', vs => vs.some(v => v === true)),
			inviteLimit: calc('inviteLimit', vs => Math.max(...vs)),
			inviteLimitCycle: calc('inviteLimitCycle', vs => Math.max(...vs)),
			inviteExpirationTime: calc('inviteExpirationTime', vs => Math.max(...vs)),
			canManageCustomEmojis: calc('canManageCustomEmojis', vs => vs.some(v => v === true)),
			canManageAvatarDecorations: calc('canManageAvatarDecorations', vs => vs.some(v => v === true)),
			canSearchNotes: calc('canSearchNotes', vs => vs.some(v => v === true)),
			canUseTranslator: calc('canUseTranslator', vs => vs.some(v => v === true)),
			canHideAds: calc('canHideAds', vs => vs.some(v => v === true)),
			driveCapacityMb: calc('driveCapacityMb', vs => Math.max(...vs)),
			maxFileSizeMb: calc('maxFileSizeMb', vs => Math.max(...vs)),
			alwaysMarkNsfw: calc('alwaysMarkNsfw', vs => vs.some(v => v === true)),
			canUpdateBioMedia: calc('canUpdateBioMedia', vs => vs.some(v => v === true)),
			pinLimit: calc('pinLimit', vs => Math.max(...vs)),
			antennaLimit: calc('antennaLimit', vs => Math.max(...vs)),
			wordMuteLimit: calc('wordMuteLimit', vs => Math.max(...vs)),
			webhookLimit: calc('webhookLimit', vs => Math.max(...vs)),
			clipLimit: calc('clipLimit', vs => Math.max(...vs)),
			noteEachClipsLimit: calc('noteEachClipsLimit', vs => Math.max(...vs)),
			userListLimit: calc('userListLimit', vs => Math.max(...vs)),
			userEachUserListsLimit: calc('userEachUserListsLimit', vs => Math.max(...vs)),
			rateLimitFactor: calc('rateLimitFactor', vs => Math.max(...vs)),
			canImportNotes: calc('canImportNotes', vs => vs.some(v => v === true)),
			avatarDecorationLimit: calc('avatarDecorationLimit', vs => Math.max(...vs)),
			canImportAntennas: calc('canImportAntennas', vs => vs.some(v => v === true)),
			canImportBlocking: calc('canImportBlocking', vs => vs.some(v => v === true)),
			canImportFollowing: calc('canImportFollowing', vs => vs.some(v => v === true)),
			canImportMuting: calc('canImportMuting', vs => vs.some(v => v === true)),
			canImportUserLists: calc('canImportUserLists', vs => vs.some(v => v === true)),
			chatAvailability: calc('chatAvailability', aggregateChatAvailability),
			canTrend: calc('canTrend', vs => vs.some(v => v === true)),
			canViewFederation: calc('canViewFederation', vs => vs.some(v => v === true)),
		};
	}

	@bindThis
	public async isModerator(user: { id: MiUser['id'] } | null): Promise<boolean> {
		if (user == null) return false;

		// Check for dropped token permissions
		const rank = getCallerId(user)?.accessToken?.rank;
		if (rank != null && rank !== 'admin' && rank !== 'mod') return false;

		return (this.meta.rootUserId === user.id) || (await this.getUserRoles(user.id)).some(r => r.isModerator || r.isAdministrator);
	}

	@bindThis
	public async isAdministrator(user: { id: MiUser['id'] } | null): Promise<boolean> {
		if (user == null) return false;

		// Check for dropped token permissions
		const rank = getCallerId(user)?.accessToken?.rank;
		if (rank != null && rank !== 'admin') return false;

		return (this.meta.rootUserId === user.id) || (await this.getUserRoles(user.id)).some(r => r.isAdministrator);
	}

	@bindThis
	public async isExplorable(role: { id: MiRole['id'] } | null): Promise<boolean> {
		if (role == null) return false;
		const check = await this.rolesRepository.findOneBy({ id: role.id });
		if (check == null) return false;
		return check.isExplorable;
	}

	/**
	 * モデレーター権限のロールが割り当てられているユーザID一覧を取得する.
	 *
	 * @param opts.includeAdmins 管理者権限も含めるか(デフォルト: true)
	 * @param opts.includeRoot rootユーザも含めるか(デフォルト: false)
	 * @param opts.excludeExpire 期限切れのロールを除外するか(デフォルト: false)
	 */
	@bindThis
	public async getModeratorIds(opts?: {
		includeAdmins?: boolean,
		includeRoot?: boolean,
		excludeExpire?: boolean,
	}): Promise<MiUser['id'][]> {
		const includeAdmins = opts?.includeAdmins ?? true;
		const includeRoot = opts?.includeRoot ?? false;
		const excludeExpire = opts?.excludeExpire ?? false;

		const roles = await this.rolesCache.fetch(() => this.rolesRepository.findBy({}));
		const moderatorRoles = includeAdmins
			? roles.filter(r => r.isModerator || r.isAdministrator)
			: roles.filter(r => r.isModerator);

		const assigns = moderatorRoles.length > 0
			? await this.roleAssignmentsRepository.findBy({ roleId: In(moderatorRoles.map(r => r.id)) })
			: [];

		// Setを経由して重複を除去（ユーザIDは重複する可能性があるので）
		const now = this.timeService.now;
		const resultSet = new Set(
			assigns
				.filter(it =>
					(excludeExpire)
						? (it.expiresAt == null || it.expiresAt.getTime() > now)
						: true,
				)
				.map(a => a.userId),
		);

		if (includeRoot && this.meta.rootUserId) {
			resultSet.add(this.meta.rootUserId);
		}

		return [...resultSet].sort((x, y) => x.localeCompare(y));
	}

	@bindThis
	public async getModerators(opts?: {
		includeAdmins?: boolean,
		includeRoot?: boolean,
		excludeExpire?: boolean,
	}): Promise<MiUser[]> {
		const ids = await this.getModeratorIds(opts);
		return ids.length > 0
			? await this.usersRepository.findBy({
				id: In(ids),
			})
			: [];
	}

	@bindThis
	public async getAdministratorIds(): Promise<MiUser['id'][]> {
		const roles = await this.rolesCache.fetch(() => this.rolesRepository.findBy({}));
		const administratorRoles = roles.filter(r => r.isAdministrator);
		const assigns = administratorRoles.length > 0 ? await this.roleAssignmentsRepository.findBy({
			roleId: In(administratorRoles.map(r => r.id)),
		}) : [];
		// TODO: isRootなアカウントも含める
		return assigns.map(a => a.userId);
	}

	@bindThis
	public async getAdministrators(): Promise<MiUser[]> {
		const ids = await this.getAdministratorIds();
		const users = ids.length > 0 ? await this.usersRepository.findBy({
			id: In(ids),
		}) : [];
		return users;
	}

	@bindThis
	public async assign(userId: MiUser['id'], roleId: MiRole['id'], expiresAt: Date | null = null, moderator?: MiUser): Promise<void> {
		const now = this.timeService.now;

		const role = await this.rolesRepository.findOneByOrFail({ id: roleId });

		const existing = await this.roleAssignmentsRepository.findOneBy({
			roleId: roleId,
			userId: userId,
		});

		if (existing) {
			if (existing.expiresAt && (existing.expiresAt.getTime() < now)) {
				await this.roleAssignmentsRepository.delete({
					roleId: roleId,
					userId: userId,
				});
			} else {
				throw new RoleService.AlreadyAssignedError();
			}
		}

		const created = await this.roleAssignmentsRepository.insertOne({
			id: this.idService.gen(now),
			expiresAt: expiresAt,
			roleId: roleId,
			userId: userId,
		});

		this.rolesRepository.update(roleId, {
			lastUsedAt: this.timeService.date,
		});

		this.globalEventService.publishInternalEvent('userRoleAssigned', created);

		const user = await this.usersRepository.findOneByOrFail({ id: userId });

		if (role.isPublic && user.host === null) {
			this.notificationService.createNotification(userId, 'roleAssigned', {
				roleId: roleId,
			});
		}

		if (moderator) {
			this.moderationLogService.log(moderator, 'assignRole', {
				roleId: roleId,
				roleName: role.name,
				userId: userId,
				userUsername: user.username,
				userHost: user.host,
				expiresAt: expiresAt ? expiresAt.toISOString() : null,
			});
		}
	}

	@bindThis
	public async unassign(userId: MiUser['id'], roleId: MiRole['id'], moderator?: MiUser): Promise<void> {
		const now = this.timeService.date;

		const existing = await this.roleAssignmentsRepository.findOneBy({ roleId, userId });
		if (existing == null) {
			throw new RoleService.NotAssignedError();
		} else if (existing.expiresAt && (existing.expiresAt.getTime() < now.getTime())) {
			await this.roleAssignmentsRepository.delete({
				roleId: roleId,
				userId: userId,
			});
			throw new RoleService.NotAssignedError();
		}

		await this.roleAssignmentsRepository.delete(existing.id);

		this.rolesRepository.update(roleId, {
			lastUsedAt: now,
		});

		this.globalEventService.publishInternalEvent('userRoleUnassigned', existing);

		if (moderator) {
			const [user, role] = await Promise.all([
				this.usersRepository.findOneByOrFail({ id: userId }),
				this.rolesRepository.findOneByOrFail({ id: roleId }),
			]);
			this.moderationLogService.log(moderator, 'unassignRole', {
				roleId: roleId,
				roleName: role.name,
				userId: userId,
				userUsername: user.username,
				userHost: user.host,
			});
		}
	}

	@bindThis
	public async addNoteToRoleTimeline(note: Packed<'Note'>): Promise<void> {
		const roles = await this.getUserRoles(note.userId);

		const redisPipeline = this.redisForTimelines.pipeline();

		for (const role of roles) {
			this.fanoutTimelineService.push(`roleTimeline:${role.id}`, note.id, 1000, redisPipeline);
			this.globalEventService.publishRoleTimelineStream(role.id, 'note', note);
		}

		await redisPipeline.exec();
	}

	@bindThis
	public async create(values: Partial<MiRole>, moderator?: MiUser): Promise<MiRole> {
		this.assertValidRole(values);

		const date = this.timeService.date;
		const created = await this.rolesRepository.insertOne({
			id: this.idService.gen(date.getTime()),
			updatedAt: date,
			lastUsedAt: date,
			name: values.name,
			description: values.description,
			color: values.color,
			iconUrl: values.iconUrl,
			target: values.target,
			condFormula: values.condFormula,
			isPublic: values.isPublic,
			isAdministrator: values.isAdministrator,
			isModerator: values.isModerator,
			isExplorable: values.isExplorable,
			asBadge: values.asBadge,
			preserveAssignmentOnMoveAccount: values.preserveAssignmentOnMoveAccount,
			canEditMembersByModerator: values.canEditMembersByModerator,
			displayOrder: values.displayOrder,
			policies: values.policies,
		});

		this.globalEventService.publishInternalEvent('roleCreated', created);

		if (moderator) {
			this.moderationLogService.log(moderator, 'createRole', {
				roleId: created.id,
				role: created,
			});
		}

		return created;
	}

	@bindThis
	public async update(role: MiRole, params: Partial<MiRole>, moderator?: MiUser): Promise<void> {
		this.assertValidRole(params);

		const date = this.timeService.date;
		await this.rolesRepository.update(role.id, {
			updatedAt: date,
			...params,
		});

		const updated = await this.rolesRepository.findOneByOrFail({ id: role.id });
		this.globalEventService.publishInternalEvent('roleUpdated', updated);

		if (moderator) {
			this.moderationLogService.log(moderator, 'updateRole', {
				roleId: role.id,
				before: role,
				after: updated,
			});
		}
	}

	@bindThis
	public async clone(role: MiRole, moderator?: MiUser): Promise<MiRole> {
		const suffix = ' (cloned)';
		const newName = role.name.slice(0, 256 - suffix.length) + suffix;

		return this.create({
			...role,
			name: newName,
		}, moderator);
	}

	@bindThis
	public async delete(role: MiRole, moderator?: MiUser): Promise<void> {
		await this.rolesRepository.delete({ id: role.id });
		this.globalEventService.publishInternalEvent('roleDeleted', role);

		if (moderator) {
			this.moderationLogService.log(moderator, 'deleteRole', {
				roleId: role.id,
				role: role,
			});
		}
	}

	@bindThis
	public dispose(): void {
		this.redisForSub.off('message', this.onMessage);
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}

	@bindThis
	public assertValidRole(role: Partial<MiRole>): void {
		if (!role.policies) return;

		if (this.roleValidator(role.policies)) return;

		throw new IdentifiableError(
			'39d78ad7-0f00-4bff-b2e2-2e7db889e05d',
			'invalid policy values',
			false,
			this.roleValidator.errors,
		);
	}

	@bindThis
	public assertValidDefaultPolicies(policies: object): void {
		if (this.defaultPoliciesValidator(policies)) return;

		throw new IdentifiableError(
			'39d78ad7-0f00-4bff-b2e2-2e7db889e05d',
			'invalid policy values',
			false,
			this.defaultPoliciesValidator.errors,
		);
	}
}
