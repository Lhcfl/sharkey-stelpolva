/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import _Ajv from 'ajv';
import { ModuleRef } from '@nestjs/core';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { Packed } from '@/misc/json-schema.js';
import type { Promiseable } from '@/misc/prelude/await-all.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import { USER_ACTIVE_THRESHOLD, USER_ONLINE_THRESHOLD, permissions } from '@/const.js';
import type { MiPartialUser, MiUser } from '@/models/User.js';
import {
	birthdaySchema,
	descriptionSchema,
	listenbrainzSchema,
	localUsernameSchema,
	locationSchema,
	nameSchema,
	passwordSchema,
} from '@/models/User.js';
import type {
	BlockingsRepository,
	DriveFilesRepository,
	FollowingsRepository,
	FollowRequestsRepository,
	MiFollowing,
	MiInstance,
	MiMeta,
	MiUserNotePining,
	MiUserProfile,
	MutingsRepository,
	RenoteMutingsRepository,
	UserMemoRepository,
	UserNotePiningsRepository,
	UserProfilesRepository,
	UserSecurityKeysRepository,
	UsersRepository,
} from '@/models/_.js';
import { IsOne } from '@/misc/is-one.js';
import { bindThis } from '@/decorators.js';
import { getCallerId } from '@/misc/attach-caller-id.js';
import { isSystemAccount } from '@/misc/is-system-account.js';
import { TimeService } from '@/global/TimeService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { IdService } from '@/core/IdService.js';
import type { RolePolicies, RoleService } from '@/core/RoleService.js';
import type { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import type { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import type { AnnouncementService } from '@/core/AnnouncementService.js';
import type { CustomEmojiService } from '@/core/CustomEmojiService.js';
import type { AvatarDecorationService } from '@/core/AvatarDecorationService.js';
import type { ChatService } from '@/core/ChatService.js';
import type { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import type { CacheService, UserRelation } from '@/core/CacheService.js';
import type { OnModuleInit } from '@nestjs/common';
import type { NoteEntityService } from './NoteEntityService.js';
import type { PageEntityService } from './PageEntityService.js';

/* eslint-disable @typescript-eslint/no-non-null-assertion */

const Ajv = _Ajv.default;
const ajv = new Ajv();

function isLocalUser<TUser extends Pick<MiUser, 'host' | 'uri'> = MiUser>(user: TUser): user is TUser & { host: null, uri: null } {
	return user.host == null;
}

function isRemoteUser<TUser extends Pick<MiUser, 'host' | 'uri'> = MiUser>(user: TUser): user is TUser & { host: string, uri: string } {
	return !isLocalUser(user);
}

@Injectable()
export class UserEntityService implements OnModuleInit {
	private apPersonService: ApPersonService;
	private noteEntityService: NoteEntityService;
	private driveFileEntityService: DriveFileEntityService;
	private pageEntityService: PageEntityService;
	private customEmojiService: CustomEmojiService;
	private announcementService: AnnouncementService;
	private roleService: RoleService;
	private federatedInstanceService: FederatedInstanceService;
	private avatarDecorationService: AvatarDecorationService;
	private chatService: ChatService;
	private cacheService: CacheService;

	constructor(
		private moduleRef: ModuleRef,

		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userSecurityKeysRepository)
		private userSecurityKeysRepository: UserSecurityKeysRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.followRequestsRepository)
		private followRequestsRepository: FollowRequestsRepository,

		@Inject(DI.blockingsRepository)
		private blockingsRepository: BlockingsRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		@Inject(DI.renoteMutingsRepository)
		private renoteMutingsRepository: RenoteMutingsRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.userNotePiningsRepository)
		private userNotePiningsRepository: UserNotePiningsRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.userMemosRepository)
		private userMemosRepository: UserMemoRepository,

		private readonly timeService: TimeService,
		private readonly utilityService: UtilityService,
		private readonly idService: IdService,
	) {
	}

	@bindThis
	public onModuleInit() {
		this.apPersonService = this.moduleRef.get('ApPersonService');
		this.noteEntityService = this.moduleRef.get('NoteEntityService');
		this.driveFileEntityService = this.moduleRef.get('DriveFileEntityService');
		this.pageEntityService = this.moduleRef.get('PageEntityService');
		this.customEmojiService = this.moduleRef.get('CustomEmojiService');
		this.announcementService = this.moduleRef.get('AnnouncementService');
		this.roleService = this.moduleRef.get('RoleService');
		this.federatedInstanceService = this.moduleRef.get('FederatedInstanceService');
		this.avatarDecorationService = this.moduleRef.get('AvatarDecorationService');
		this.cacheService = this.moduleRef.get('CacheService');
		this.chatService = this.moduleRef.get('ChatService');
		this.cacheService = this.moduleRef.get('CacheService');
	}

	//#region Validators
	public validateLocalUsername = ajv.compile(localUsernameSchema);
	public validatePassword = ajv.compile(passwordSchema);
	public validateName = ajv.compile(nameSchema);
	public validateDescription = ajv.compile(descriptionSchema);
	public validateLocation = ajv.compile(locationSchema);
	public validateBirthday = ajv.compile(birthdaySchema);
	public validateListenBrainz = ajv.compile(listenbrainzSchema);
	//#endregion

	/** @deprecated use export from MiUser */
	public isLocalUser = isLocalUser;
	/** @deprecated use export from MiUser */
	public isRemoteUser = isRemoteUser;

	@bindThis
	public async getHasUnreadAntenna(userId: MiUser['id']): Promise<boolean> {
		/*
		const myAntennas = (await this.antennaService.getAntennas()).filter(a => a.userId === userId);

		const isUnread = (myAntennas.length > 0 ? await this.antennaNotesRepository.exists({
			where: {
				antennaId: In(myAntennas.map(x => x.id)),
				read: false,
			},
		}) : false);

		return isUnread;
		*/
		return false; // TODO
	}

	// TODO optimization: make redis calls in MULTI
	@bindThis
	public async getNotificationsInfo(userId: MiUser['id']): Promise<{
		hasUnread: boolean;
		unreadCount: number;
	}> {
		const response = {
			hasUnread: false,
			unreadCount: 0,
		};

		const latestReadNotificationId = await this.redisClient.get(`latestReadNotification:${userId}`);

		if (!latestReadNotificationId) {
			response.unreadCount = await this.redisClient.xlen(`notificationTimeline:${userId}`);
		} else {
			const latestNotificationIdsRes = await this.redisClient.xrevrange(
				`notificationTimeline:${userId}`,
				'+',
				latestReadNotificationId,
			);

			response.unreadCount = (latestNotificationIdsRes.length - 1 >= 0) ? latestNotificationIdsRes.length - 1 : 0;
		}

		if (response.unreadCount > 0) {
			response.hasUnread = true;
		}

		return response;
	}

	@bindThis
	public async getHasPendingReceivedFollowRequest(userId: MiUser['id']): Promise<boolean> {
		return await this.followRequestsRepository.existsBy({
			followeeId: userId,
		});
	}

	@bindThis
	public async getHasPendingSentFollowRequest(userId: MiUser['id']): Promise<boolean> {
		return await this.followRequestsRepository.existsBy({
			followerId: userId,
		});
	}

	@bindThis
	public getOnlineStatus(user: MiUser): 'unknown' | 'online' | 'active' | 'offline' {
		if (user.hideOnlineStatus) return 'unknown';
		if (user.lastActiveDate == null) return 'unknown';
		const elapsed = this.timeService.now - user.lastActiveDate.getTime();
		return (
			elapsed < USER_ONLINE_THRESHOLD ? 'online' :
			elapsed < USER_ACTIVE_THRESHOLD ? 'active' :
			'offline'
		);
	}

	@bindThis
	public async fetchAlsoKnownAs(user: MiUser): Promise<{ uri: string, id: string | null }[] | null> {
		if (!user.alsoKnownAs) {
			return null;
		}

		const akaUsers = new Map(await this.cacheService.uriPersonCache.fetchMany(user.alsoKnownAs));
		if (akaUsers.size < 1) {
			return null;
		}

		return user.alsoKnownAs.map(uri => ({
			uri,
			id: akaUsers.get(uri) ?? null,
		}));
	}

	@bindThis
	public getIdenticonUrl(user: MiUser): string {
		if ((user.host == null || user.host === this.config.host) && user.username.includes('.') && this.meta.iconUrl) { // ローカルのシステムアカウントの場合
			return this.meta.iconUrl;
		} else {
			return `${this.config.url}/identicon/${user.username.toLowerCase()}@${user.host ?? this.config.host}`;
		}
	}

	@bindThis
	public getUserUri(user: MiPartialUser): string {
		return isRemoteUser(user)
			? user.uri : this.genLocalUserUri(user.id);
	}

	@bindThis
	public genLocalUserUri(userId: string): string {
		return `${this.config.url}/users/${userId}`;
	}

	public async pack<S extends 'MeDetailed' | 'UserDetailedNotMe' | 'UserDetailed' | 'UserLite' = 'UserLite'>(
		src: MiUser['id'] | MiUser,
		me?: { id: MiUser['id']; } | null | undefined,
		options?: {
			schema?: S,
			includeSecrets?: boolean,
			hint?: {
				userProfile?: MiUserProfile,
				userMemos?: Map<MiUser['id'], string | null>,
				pinNotes?: Map<MiUser['id'], MiUserNotePining[]>,
				userIdsByUri?: Map<string, string>,
				instances?: Map<string, MiInstance | null>,
				securityKeyCounts?: Map<string, number>,
				userRelation?: UserRelation,
				userRelations?: Map<MiUser['id'], UserRelation>,
				iAmModerator?: boolean,
				iAmAdmin?: boolean,
			}
		},
	): Promise<Packed<S>> {
		const opts = Object.assign({
			schema: 'UserLite',
			includeSecrets: false,
		}, options);

		const user = typeof src === 'object' ? src : await this.cacheService.findUserById(src);

		// migration
		if (user.avatarId != null && user.avatarUrl === null) {
			const avatar = await this.driveFilesRepository.findOneByOrFail({ id: user.avatarId });
			user.avatarUrl = this.driveFileEntityService.getPublicUrl(avatar, 'avatar');
			await this.usersRepository.update(user.id, {
				avatarUrl: user.avatarUrl,
				avatarBlurhash: avatar.blurhash,
			});
		}
		if (user.bannerId != null && user.bannerUrl === null) {
			const banner = await this.driveFilesRepository.findOneByOrFail({ id: user.bannerId });
			user.bannerUrl = this.driveFileEntityService.getPublicUrl(banner);
			await this.usersRepository.update(user.id, {
				bannerUrl: user.bannerUrl,
				bannerBlurhash: banner.blurhash,
			});
		}
		if (user.backgroundId != null && user.backgroundUrl === null) {
			const background = await this.driveFilesRepository.findOneByOrFail({ id: user.backgroundId });
			user.backgroundUrl = this.driveFileEntityService.getPublicUrl(background);
			await this.usersRepository.update(user.id, {
				backgroundUrl: user.backgroundUrl,
				backgroundBlurhash: background.blurhash,
			});
		}

		const isDetailed = opts.schema !== 'UserLite';
		const meId = me ? me.id : null;
		const isMe = meId === user.id;
		const iAmAdmin = me ? (opts.hint?.iAmAdmin ?? await this.roleService.isAdministrator(me)) : false;
		const iAmModerator = me ? (opts.hint?.iAmModerator ?? (iAmAdmin || await this.roleService.isModerator(me))) : false;
		const iAmRoot = iAmAdmin && me && this.meta.rootUserId === me.id;

		const profile = isDetailed
			? (opts.hint?.userProfile ?? user.userProfile ?? await this.cacheService.userProfileCache.fetch(user.id))
			: null;

		const relation = opts.hint?.userRelation ?? opts.hint?.userRelations?.get(user.id) ?? (meId ? await this.cacheService.getUserRelation(meId, user) : undefined);

		let memo: string | null = null;
		if (isDetailed && meId) {
			if (opts.hint?.userMemos) {
				memo = opts.hint.userMemos.get(user.id) ?? null;
			} else {
				memo = await this.userMemosRepository.findOneBy({ userId: meId, targetUserId: user.id })
					.then(row => row?.memo ?? null);
			}
		}

		let pins: MiUserNotePining[] = [];
		if (isDetailed) {
			if (opts.hint?.pinNotes) {
				pins = opts.hint.pinNotes.get(user.id) ?? [];
			} else {
				pins = await this.userNotePiningsRepository.createQueryBuilder('pin')
					.where('pin.userId = :userId', { userId: user.id })
					.innerJoinAndSelect('pin.note', 'note')
					.orderBy('pin.id', 'DESC')
					.getMany();
			}
		}

		const mastoapi = !isDetailed ? (opts.hint?.userProfile ?? user.userProfile ?? await this.cacheService.userProfileCache.fetch(user.id)) : null;

		const followingCount = profile == null ? null :
			(profile.followingVisibility === 'public') || isMe || iAmModerator ? user.followingCount :
			(profile.followingVisibility === 'followers') && relation?.isFollowing ? user.followingCount :
			null;

		const followersCount = profile == null ? null :
			(profile.followersVisibility === 'public') || isMe || iAmModerator ? user.followersCount :
			(profile.followersVisibility === 'followers') && relation?.isFollowing ? user.followersCount :
			null;

		const unreadAnnouncements = isMe && isDetailed ?
			(await this.announcementService.getUnreadAnnouncements(user)).map((announcement) => ({
				createdAt: this.idService.parse(announcement.id).date.toISOString(),
				...announcement,
			})) : null;

		const checkHost = user.host == null ? this.config.host : user.host;
		const notificationsInfo = isMe && isDetailed ? await this.getNotificationsInfo(user.id) : null;

		const getLocalUserDecorations = () =>
			user.avatarDecorations.length > 0
				? this.avatarDecorationService.getAll().then(decorations => user.avatarDecorations.filter(ud => decorations.some(d => d.id === ud.id)).map(ud => ({
					id: ud.id,
					angle: ud.angle || undefined,
					flipH: ud.flipH || undefined,
					offsetX: ud.offsetX || undefined,
					offsetY: ud.offsetY || undefined,
					showBelow: ud.showBelow || undefined,
					url: decorations.find(d => d.id === ud.id)!.url,
				})))
				: [];
		const avatarDecorations = user.host == null
			? getLocalUserDecorations()
			: this.cacheService.stpvRemoteUserDecorationsCache.fetch(user.id).then(res => res.map(ad => ({
				...ad,
				url: ad.url && (this.config.proxyRemoteFiles || this.config.mediaProxy)
					? `${this.config.mediaProxy}/static.webp?url=${(encodeURIComponent(ad.url))}`
					: ad.url,
			})));
		let fetchPoliciesPromise: Promise<RolePolicies> | null = null;
		const fetchPolicies = () => fetchPoliciesPromise ??= this.roleService.getUserPolicies(user);

		// This has a cache so it's fine to await here
		const alsoKnownAs = await this.fetchAlsoKnownAs(user);
		const alsoKnownAsIds = alsoKnownAs?.map(aka => aka.id).filter(id => id != null) ?? null;

		const bypassSilence = isMe || !!relation?.isFollowing;

		// This is pulled out for readability, but needs to remain async until awaitAll() below.
		const instancePromise = user.host != null
			? Promise.resolve(opts.hint?.instances?.get(user.host) ?? this.federatedInstanceService.fetch(user.host))
			: null;

		// noinspection ES6MissingAwait
		const packed = {
			id: user.id,
			name: user.name,
			username: user.username,
			host: user.host,
			avatarUrl: (user.avatarId == null ? null : user.avatarUrl) ?? this.getIdenticonUrl(user),
			avatarBlurhash: (user.avatarId == null ? null : user.avatarBlurhash),
			description: mastoapi ? mastoapi.description : profile ? profile.description : '',
			createdAt: this.idService.parse(user.id).date.toISOString(),
			updatedAt: user.updatedAt ? user.updatedAt.toISOString() : null,
			lastFetchedAt: user.lastFetchedAt ? user.lastFetchedAt.toISOString() : null,
			avatarDecorations,
			isBot: user.isBot,
			isCat: user.isCat,
			noindex: user.noindex,
			enableRss: user.enableRss,
			mandatoryCW: user.mandatoryCW,
			rejectQuotes: user.rejectQuotes,
			attributionDomains: user.attributionDomains,
			isSilenced: user.isSilenced,
			bypassSilence: bypassSilence,
			speakAsCat: user.speakAsCat ?? false,
			approved: user.approved,
			requireSigninToViewContents: user.requireSigninToViewContents === false ? undefined : true,
			makeNotesFollowersOnlyBefore: user.makeNotesFollowersOnlyBefore ?? undefined,
			makeNotesHiddenBefore: user.makeNotesHiddenBefore ?? undefined,
			instance: instancePromise?.then(instance => ({
				name: instance.name,
				softwareName: instance.softwareName,
				softwareVersion: instance.softwareVersion,
				iconUrl: instance.iconUrl,
				faviconUrl: instance.faviconUrl,
				themeColor: instance.themeColor,
				isSilenced: instance.isSilenced,
				mandatoryCW: instance.mandatoryCW,
			})),
			followersCount: followersCount ?? 0,
			followingCount: followingCount ?? 0,
			notesCount: user.notesCount,
			emojis: this.customEmojiService.populateEmojis(user.emojis, checkHost),
			onlineStatus: this.getOnlineStatus(user),
			// パフォーマンス上の理由でローカルユーザーのみ
			badgeRoles: user.host == null ? this.roleService.getUserBadgeRoles(user).then((rs) => rs
				.filter((r) => r.isPublic || iAmModerator)
				.sort((a, b) => b.displayOrder - a.displayOrder)
				.map((r) => ({
					name: r.name,
					iconUrl: r.iconUrl,
					displayOrder: r.displayOrder,
				})),
			) : undefined,

			...(isDetailed ? {
				url: profile!.url,
				uri: user.uri,
				// TODO hints for all of this
				movedTo: user.movedToUri ? Promise.resolve(opts.hint?.userIdsByUri?.get(user.movedToUri) ?? this.apPersonService.resolvePerson(user.movedToUri).then(user => user.id).catch(() => null)) : null,
				movedToUri: user.movedToUri,
				// alsoKnownAs moved from packedUserDetailedNotMeOnly for privacy
				bannerUrl: user.bannerId == null ? null : user.bannerUrl,
				bannerBlurhash: user.bannerId == null ? null : user.bannerBlurhash,
				backgroundUrl: user.backgroundId == null ? null : user.backgroundUrl,
				backgroundBlurhash: user.backgroundId == null ? null : user.backgroundBlurhash,
				isLocked: user.isLocked,
				isSuspended: user.isSuspended || (user.host != null && !this.utilityService.isFederationAllowedHost(user.host)),
				location: profile!.location,
				birthday: profile!.birthday,
				listenbrainz: profile!.listenbrainz,
				lang: profile!.lang,
				fields: profile!.fields,
				verifiedLinks: profile!.verifiedLinks,
				pinnedNoteIds: pins.map(pin => pin.noteId),
				pinnedNotes: this.noteEntityService.packMany(pins.map(pin => pin.note!), me, {
					detail: true,
					hint: { iAmAdmin, iAmModerator, userRelations: opts.hint?.userRelations },
				}),
				pinnedPageId: profile!.pinnedPageId,
				pinnedPage: profile!.pinnedPageId ? this.pageEntityService.pack(profile!.pinnedPageId, me) : null,
				publicReactions: this.isLocalUser(user) ? profile!.publicReactions : false, // https://github.com/misskey-dev/misskey/issues/12964
				followersVisibility: profile!.followersVisibility,
				followingVisibility: profile!.followingVisibility,
				chatScope: user.chatScope,
				canChat: fetchPolicies().then(r => r.chatAvailability === 'available'),
				roles: this.roleService.getUserRoles(user).then(roles => roles.filter(role => role.isPublic).sort((a, b) => b.displayOrder - a.displayOrder).map(role => ({
					id: role.id,
					name: role.name,
					color: role.color,
					iconUrl: role.iconUrl,
					description: role.description,
					isModerator: role.isModerator,
					isAdministrator: role.isAdministrator,
					displayOrder: role.displayOrder,
				}))),
				memo: memo,
				moderationNote: iAmModerator ? (profile!.moderationNote ?? '') : undefined,
				isSystem: isSystemAccount(user),
			} : {}),

			...(isDetailed && (isMe || iAmModerator) ? {
				twoFactorEnabled: profile!.twoFactorEnabled,
				usePasswordLessLogin: profile!.usePasswordLessLogin,
				securityKeys: profile!.twoFactorEnabled
					// TODO make all this "exists" instead
					? Promise.resolve(opts.hint?.securityKeyCounts?.get(user.id) ?? this.userSecurityKeysRepository.countBy({ userId: user.id })).then(result => result >= 1)
					: false,
				isDeleted: user.isDeleted,
				deletedAt: user.deletedAt?.toISOString() ?? null,
			} : {}),

			...(isDetailed && iAmRoot ? {
				isRoot: true,
			} : {}),

			...(isDetailed && isMe ? {
				avatarId: user.avatarId,
				bannerId: user.bannerId,
				backgroundId: user.backgroundId,
				followedMessage: profile!.followedMessage,
				isModerator: iAmModerator,
				isAdmin: iAmAdmin,
				injectFeaturedNote: profile!.injectFeaturedNote,
				receiveAnnouncementEmail: profile!.receiveAnnouncementEmail,
				alwaysMarkNsfw: profile!.alwaysMarkNsfw,
				defaultSensitive: profile!.defaultSensitive,
				autoSensitive: profile!.autoSensitive,
				carefulBot: profile!.carefulBot,
				autoAcceptFollowed: profile!.autoAcceptFollowed,
				noCrawle: profile!.noCrawle,
				preventAiLearning: profile!.preventAiLearning,
				isExplorable: user.isExplorable,
				twoFactorBackupCodesStock: profile?.twoFactorBackupSecret?.length === 5 ? 'full' : (profile?.twoFactorBackupSecret?.length ?? 0) > 0 ? 'partial' : 'none',
				hideOnlineStatus: user.hideOnlineStatus,
				hasUnreadSpecifiedNotes: false, // 後方互換性のため
				hasUnreadMentions: false, // 後方互換性のため
				hasUnreadChatMessages: this.chatService.hasUnreadMessages(user.id),
				hasUnreadAnnouncement: unreadAnnouncements!.length > 0,
				unreadAnnouncements,
				hasUnreadAntenna: this.getHasUnreadAntenna(user.id),
				hasUnreadChannel: false, // 後方互換性のため
				hasUnreadNotification: notificationsInfo?.hasUnread, // 後方互換性のため
				hasPendingReceivedFollowRequest: this.getHasPendingReceivedFollowRequest(user.id),
				hasPendingSentFollowRequest: this.getHasPendingSentFollowRequest(user.id),
				unreadNotificationsCount: notificationsInfo?.unreadCount,
				mutedWords: profile!.mutedWords,
				hardMutedWords: profile!.hardMutedWords,
				mutedInstances: profile!.mutedInstances,
				mutingNotificationTypes: [], // 後方互換性のため
				notificationRecieveConfig: profile!.notificationRecieveConfig,
				emailNotificationTypes: profile!.emailNotificationTypes,
				achievements: profile!.achievements,
				loggedInDays: profile!.loggedInDates.length,
				policies: fetchPolicies(),
				permissions: this.getPermissions(user, iAmModerator, iAmAdmin),
				defaultCW: profile!.defaultCW,
				defaultCWPriority: profile!.defaultCWPriority,
				allowUnsignedFetch: user.allowUnsignedFetch,
				// alsoKnownAs moved from packedUserDetailedNotMeOnly for privacy
				alsoKnownAs: alsoKnownAsIds,
				skAlsoKnownAs: alsoKnownAs,
			} : {}),

			...(opts.includeSecrets ? {
				email: profile!.email,
				emailVerified: profile!.emailVerified,
				signupReason: user.signupReason,
				securityKeysList: profile!.twoFactorEnabled
					? this.userSecurityKeysRepository.find({
						where: {
							userId: user.id,
						},
						select: {
							id: true,
							name: true,
							lastUsed: true,
						},
					})
					: [],
			} : {}),

			...(relation && isDetailed ? {
				isFollowing: !!relation.isFollowing,
				isFollowed: !!relation.isFollowed,
				hasPendingFollowRequestFromYou: relation.isFollowing === 0,
				hasPendingFollowRequestToYou: relation.isFollowed === 0,
				isBlocking: relation.isBlocking,
				isBlocked: relation.isBlocked,
				isMuted: relation.isMuting,
				isRenoteMuted: relation.isMutingRenotes,
				notify: relation.isFollowingWithNotifications ? 'normal' : 'none',
				withReplies: relation.isFollowedWithReplies,
				followedMessage: relation.isFollowing ? profile!.followedMessage : undefined,
			} : {}),
		} as Promiseable<Packed<S>>;

		return await awaitAll(packed);
	}

	public async packMany<S extends 'MeDetailed' | 'UserDetailedNotMe' | 'UserDetailed' | 'UserLite' = 'UserLite'>(
		usersOrIds: (MiUser['id'] | MiUser)[],
		me?: { id: MiUser['id'] } | null | undefined,
		options?: {
			schema?: S,
			includeSecrets?: boolean,
			hint?: {
				userRelations?: Map<string, UserRelation>,
				iAmModerator?: boolean,
				iAmAdmin?: boolean,
			},
		},
	): Promise<Packed<S>[]> {
		if (usersOrIds.length === 0) return [];

		// -- IDのみの要素を補完して完全なエンティティ一覧を作る

		const fetchedUsers = new Map<string, MiUser>();
		const toFetch: string[] = [];
		for (const userOrId of usersOrIds) {
			if (typeof(userOrId) === 'object') {
				fetchedUsers.set(userOrId.id, userOrId);
			} else {
				toFetch.push(userOrId);
			}
		}

		if (toFetch.length > 0) {
			const fetched = await this.cacheService.findUsersById(toFetch);
			for (const [id, user] of fetched) {
				fetchedUsers.set(id, user);
			}
		}

		// Restore the original user order
		const users = usersOrIds
			.map(u => fetchedUsers.get(typeof (u) === 'object' ? u.id : u))
			.filter(u => u != null);
		const userIds = users.map(u => u.id);

		// Sync with ApiCallService
		const iAmAdmin = me ? (options?.hint?.iAmAdmin ?? await this.roleService.isModerator(me)) : false;
		const iAmModerator = me ? (options?.hint?.iAmModerator ?? (iAmAdmin || await this.roleService.isModerator(me))) : false;

		const meId = me ? me.id : null;
		const isDetailed = options && options.schema !== 'UserLite';
		const isDetailedAndMod = isDetailed && iAmModerator;

		const userUris = new Set(users
			.flatMap(user => [user.uri, user.movedToUri])
			.filter((uri): uri is string => uri != null));

		const userHosts = new Set(users
			.map(user => user.host)
			.filter((host): host is string => host != null));

		const _profilesFromUsers: [string, MiUserProfile][] = [];
		const _profilesToFetch: string[] = [];
		for (const user of users) {
			if (user.userProfile) {
				_profilesFromUsers.push([user.id, user.userProfile]);
			} else {
				_profilesToFetch.push(user.id);
			}
		}

		// -- 実行者の有無や指定スキーマの種別によって要否が異なる値群を取得

		const [profilesMap, userMemos, userRelations, pinNotes, userIdsByUri, instances, securityKeyCounts] = await Promise.all([
			// profilesMap
			this.cacheService.userProfileCache.fetchMany(_profilesToFetch)
				.then(fetchedProfiles => new Map(fetchedProfiles.concat(_profilesFromUsers))),

			// userMemos
			isDetailed && meId
				? this.userMemosRepository.find({
					where: { userId: meId, targetUserId: IsOne(userIds) },
					select: { targetUserId: true, memo: true },
				})
					.then(memos => new Map(memos.map(memo => [memo.targetUserId, memo.memo])))
				: new Map(),

			// userRelations
			meId
				? this.cacheService.getUserRelations(meId, userIds, { userRelations: options?.hint?.userRelations })
				: new Map<string, UserRelation>,

			// pinNotes
			isDetailed ? this.userNotePiningsRepository.createQueryBuilder('pin')
				.where('pin.userId IN (:...userIds)', { userIds: userIds })
				.innerJoinAndSelect('pin.note', 'note')
				.getMany()
				.then(pinsNotes => {
					const map = new Map<MiUser['id'], MiUserNotePining[]>();
					for (const note of pinsNotes) {
						const notes = map.get(note.userId) ?? [];
						notes.push(note);
						map.set(note.userId, notes);
					}
					for (const [, notes] of map.entries()) {
						// pack側ではDESCで取得しているので、それに合わせて降順に並び替えておく
						notes.sort((a, b) => b.id.localeCompare(a.id));
					}
					return map;
				}) : new Map(),

			// userIdsByUri
			isDetailed
				? this.cacheService.uriPersonCache.fetchMany(userUris)
					.then(users => new Map(users))
				: new Map(),

			// instances
			this.federatedInstanceService.federatedInstanceCache.fetchMany(userHosts)
				.then(instances => new Map(instances)),

			// securityKeyCounts
			isDetailedAndMod ? this.userSecurityKeysRepository.createQueryBuilder('key')
				.select('key.userId', 'userId')
				.addSelect('count(key.id)', 'userCount')
				.where({ userId: IsOne(userIds) })
				.groupBy('key.userId')
				.getRawMany<{ userId: string, userCount: number }>()
				.then(counts => new Map(counts.map(c => [c.userId, c.userCount])))
			: undefined, // .pack will fetch the keys for the requesting user if it's in the _userIds
		]);

		return await Promise.all(
			users.map(u => this.pack(
				u,
				me,
				{
					...options,
					hint: {
						userProfile: profilesMap.get(u.id),
						userMemos,
						pinNotes,
						userIdsByUri,
						instances,
						securityKeyCounts,
						userRelations,
						iAmModerator,
						iAmAdmin,
					},
				},
			)),
		);
	}

	@bindThis
	private getPermissions(user: MiUser, isModerator: boolean, isAdmin: boolean): readonly string[] {
		const token = getCallerId(user);
		let perms = token?.accessToken?.permission ?? permissions;

		if (!isModerator && !isAdmin) {
			perms = perms.filter(perm => !perm.startsWith('read:admin') && !perm.startsWith('write:admin'));
		}

		return perms;
	}
}
