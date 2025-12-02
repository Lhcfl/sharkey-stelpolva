/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UsersRepository, SigninsRepository, UserProfilesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { RoleEntityService } from '@/core/entities/RoleEntityService.js';
import { IdService } from '@/core/IdService.js';
import { notificationRecieveConfig } from '@/models/json-schema/user.js';
import { isSystemAccount } from '@/misc/is-system-account.js';
import { CacheService } from '@/core/CacheService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:show-user',

	res: {
		type: 'object',
		nullable: false, optional: false,
		properties: {
			email: {
				type: 'string',
				optional: false, nullable: true,
			},
			emailVerified: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			approved: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			followedMessage: {
				type: 'string',
				optional: false, nullable: true,
			},
			autoAcceptFollowed: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			noCrawle: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			preventAiLearning: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			alwaysMarkNsfw: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			autoSensitive: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			carefulBot: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			injectFeaturedNote: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			receiveAnnouncementEmail: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			mutedWords: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					anyOf: [
						{
							type: 'string',
						},
						{
							type: 'array',
							items: {
								type: 'string',
							},
						},
					],
				},
			},
			mutedInstances: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'string',
				},
			},
			notificationRecieveConfig: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					note: { optional: true, ...notificationRecieveConfig },
					follow: { optional: true, ...notificationRecieveConfig },
					mention: { optional: true, ...notificationRecieveConfig },
					reply: { optional: true, ...notificationRecieveConfig },
					renote: { optional: true, ...notificationRecieveConfig },
					quote: { optional: true, ...notificationRecieveConfig },
					reaction: { optional: true, ...notificationRecieveConfig },
					pollEnded: { optional: true, ...notificationRecieveConfig },
					receiveFollowRequest: { optional: true, ...notificationRecieveConfig },
					followRequestAccepted: { optional: true, ...notificationRecieveConfig },
					roleAssigned: { optional: true, ...notificationRecieveConfig },
					chatRoomInvitationReceived: { optional: true, ...notificationRecieveConfig },
					achievementEarned: { optional: true, ...notificationRecieveConfig },
					app: { optional: true, ...notificationRecieveConfig },
					test: { optional: true, ...notificationRecieveConfig },
				},
			},
			isModerator: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			isAdministrator: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			isSystem: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			isSilenced: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			isSuspended: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			isHibernated: {
				type: 'boolean',
				optional: false, nullable: false,
			},
			lastActiveDate: {
				type: 'string',
				optional: false, nullable: true,
			},
			moderationNote: {
				type: 'string',
				optional: false, nullable: false,
			},
			signins: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					ref: 'Signin',
				},
			},
			policies: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'RolePolicies',
			},
			roles: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					ref: 'Role',
				},
			},
			roleAssigns: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					properties: {
						createdAt: {
							type: 'string',
							optional: false, nullable: false,
						},
						expiresAt: {
							type: 'string',
							optional: false, nullable: true,
						},
						roleId: {
							type: 'string',
							optional: false, nullable: false,
						},
					},
				},
			},
			followStats: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					totalFollowing: {
						type: 'number',
						optional: false, nullable: false,
					},
					totalFollowers: {
						type: 'number',
						optional: false, nullable: false,
					},
					localFollowing: {
						type: 'number',
						optional: false, nullable: false,
					},
					localFollowers: {
						type: 'number',
						optional: false, nullable: false,
					},
					remoteFollowing: {
						type: 'number',
						optional: false, nullable: false,
					},
					remoteFollowers: {
						type: 'number',
						optional: false, nullable: false,
					},
				},
			},
			signupReason: {
				type: 'string',
				optional: false, nullable: true,
			},
			movedAt: {
				type: 'string',
				optional: true, nullable: true,
			},
			movedTo: {
				type: 'object',
				optional: true, nullable: true,
				properties: {
					uri: {
						type: 'string',
						format: 'uri',
						nullable: false, optional: false,
					},
					user: {
						type: 'object',
						ref: 'UserDetailed',
						nullable: true, optional: true,
					},
				},
			},
			alsoKnownAs: {
				type: 'array',
				nullable: true, optional: true,
				items: {
					type: 'object',
					nullable: false, optional: false,
					properties: {
						uri: {
							type: 'string',
							format: 'uri',
							nullable: false, optional: false,
						},
						user: {
							type: 'object',
							ref: 'UserDetailed',
							nullable: true, optional: true,
						},
					},
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.signinsRepository)
		private signinsRepository: SigninsRepository,

		private roleService: RoleService,
		private roleEntityService: RoleEntityService,
		private idService: IdService,
		private readonly cacheService: CacheService,
		private readonly apPersonService: ApPersonService,
		private readonly userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const [user, profile] = await Promise.all([
				this.cacheService.findUserById(ps.userId),
				this.cacheService.userProfileCache.fetch(ps.userId),
			]);

			const isModerator = await this.roleService.isModerator(user);
			const isAdministrator = await this.roleService.isAdministrator(user);
			const isSilenced = user.isSilenced || !(await this.roleService.getUserPolicies(user.id)).canPublicNote;

			const _me = await this.usersRepository.findOneByOrFail({ id: me.id });
			if (!await this.roleService.isAdministrator(_me) && await this.roleService.isAdministrator(user)) {
				throw new Error('cannot show info of admin');
			}

			const signins = await this.signinsRepository.findBy({ userId: user.id });

			const roleAssigns = await this.roleService.getUserAssigns(user.id);
			const roles = await this.roleService.getUserRoles(user.id);

			const followStats = await this.cacheService.getFollowStats(user.id);

			const movedAt = user.movedAt?.toISOString();

			const movedToUser = user.movedToUri ? await this.apPersonService.resolvePerson(user.movedToUri) : null;
			const movedTo = user.movedToUri ? {
				uri: user.movedToUri,
				user: movedToUser ? await this.userEntityService.pack(movedToUser, me, { schema: 'UserDetailed' }) : undefined,
			} : null;

			// This is kinda heavy, but it's an admin endpoint so ok.
			const aka = await this.userEntityService.resolveAlsoKnownAs(user);
			const akaUsers = aka ? await this.userEntityService.packMany(aka.map(aka => aka.id).filter(id => id != null), me, { schema: 'UserDetailed' }) : [];
			const alsoKnownAs = aka?.map(aka => ({
				uri: aka.uri,
				user: aka.id ? akaUsers.find(u => u.id === aka.id) : undefined,
			}));

			return {
				email: profile.email,
				emailVerified: profile.emailVerified,
				approved: user.approved,
				signupReason: user.signupReason,
				followedMessage: profile.followedMessage,
				autoAcceptFollowed: profile.autoAcceptFollowed,
				noCrawle: profile.noCrawle,
				preventAiLearning: profile.preventAiLearning,
				alwaysMarkNsfw: profile.alwaysMarkNsfw,
				autoSensitive: profile.autoSensitive,
				carefulBot: profile.carefulBot,
				injectFeaturedNote: profile.injectFeaturedNote,
				receiveAnnouncementEmail: profile.receiveAnnouncementEmail,
				mutedWords: profile.mutedWords,
				mutedInstances: profile.mutedInstances,
				notificationRecieveConfig: profile.notificationRecieveConfig,
				isModerator: isModerator,
				isAdministrator: isAdministrator,
				isSystem: isSystemAccount(user),
				isSilenced: isSilenced,
				isSuspended: user.isSuspended,
				isHibernated: user.isHibernated,
				lastActiveDate: user.lastActiveDate ? user.lastActiveDate.toISOString() : null,
				moderationNote: profile.moderationNote ?? '',
				signins,
				policies: await this.roleService.getUserPolicies(user.id),
				roles: await this.roleEntityService.packMany(roles, me),
				roleAssigns: roleAssigns.map(a => ({
					createdAt: this.idService.parse(a.id).date.toISOString(),
					expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
					roleId: a.roleId,
				})),
				followStats: {
					...followStats,
					totalFollowers: Math.max(user.followersCount, followStats.localFollowers + followStats.remoteFollowers),
					totalFollowing: Math.max(user.followingCount, followStats.localFollowing + followStats.remoteFollowing),
				},
				movedAt,
				movedTo,
				alsoKnownAs,
			};
		});
	}
}
