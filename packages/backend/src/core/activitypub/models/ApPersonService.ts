/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import promiseLimit from 'promise-limit';
import { DataSource, In } from 'typeorm';
import { ModuleRef } from '@nestjs/core';
import { UnrecoverableError } from 'bullmq';
import { DI } from '@/di-symbols.js';
import type { FollowingsRepository, InstancesRepository, MiMeta, UserProfilesRepository, UserPublickeysRepository, UsersRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import type { MiLocalUser, MiRemoteUser } from '@/models/User.js';
import { isRemoteUser, isLocalUser } from '@/models/User.js';
import { MiUser } from '@/models/User.js';
import { truncate } from '@/misc/truncate.js';
import type { CacheService } from '@/core/CacheService.js';
import { CacheManagementService, type ManagedQuantumKVCache } from '@/global/CacheManagementService.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import type Logger from '@/logger.js';
import type { MiNote } from '@/models/Note.js';
import { IdService } from '@/core/IdService.js';
import type { MfmService } from '@/core/MfmService.js';
import { toArray } from '@/misc/prelude/array.js';
import type { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import type { FetchInstanceMetadataService } from '@/core/FetchInstanceMetadataService.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { MiUserPublickey } from '@/models/UserPublickey.js';
import type UsersChart from '@/core/chart/charts/users.js';
import type InstanceChart from '@/core/chart/charts/instance.js';
import type { HashtagService } from '@/core/HashtagService.js';
import { MiUserNotePining } from '@/models/UserNotePining.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import { RoleService } from '@/core/RoleService.js';
import type { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import type { AccountMoveService } from '@/core/AccountMoveService.js';
import { ApUtilityService } from '@/core/activitypub/ApUtilityService.js';
import { AppLockService } from '@/core/AppLockService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { TimeService } from '@/global/TimeService.js';
import { verifyFieldLinks } from '@/misc/verify-field-link.js';
import { isRetryableError } from '@/misc/is-retryable-error.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { errorCodes, IdentifiableError } from '@/misc/identifiable-error.js';
import { QueueService } from '@/core/QueueService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { CollapsedQueueService } from '@/core/CollapsedQueueService.js';
import { promiseMap } from '@/misc/promise-map.js';
import { getApId, getApType, getNullableApId, isActor, isPost, isPropertyValue } from '../type.js';
import { ApLoggerService } from '../ApLoggerService.js';
import { extractApHashtags } from './tag.js';
import type { OnModuleInit } from '@nestjs/common';
import type { ApNoteService } from './ApNoteService.js';
import type { ApMfmService } from '../ApMfmService.js';
import type { ApResolverService, Resolver } from '../ApResolverService.js';

import type { ApImageService } from './ApImageService.js';
import type { IActor, ICollection, IObject, IOrderedCollection } from '../type.js';

const nameLength = 128;

type Field = Record<'name' | 'value', string>;

@Injectable()
export class ApPersonService implements OnModuleInit {
	// Moved from CacheService
	public readonly uriPersonCache: ManagedQuantumKVCache<string>;

	// Moved from ApDbResolverService
	private readonly publicKeyByKeyIdCache: ManagedQuantumKVCache<MiUserPublickey>;
	private readonly publicKeyByUserIdCache: ManagedQuantumKVCache<MiUserPublickey>;

	private driveFileEntityService: DriveFileEntityService;
	private federatedInstanceService: FederatedInstanceService;
	private fetchInstanceMetadataService: FetchInstanceMetadataService;
	private cacheService: CacheService;
	private apResolverService: ApResolverService;
	private apNoteService: ApNoteService;
	private apImageService: ApImageService;
	private apMfmService: ApMfmService;
	private mfmService: MfmService;
	private hashtagService: HashtagService;
	private usersChart: UsersChart;
	private instanceChart: InstanceChart;
	private accountMoveService: AccountMoveService;
	private logger: Logger;
	private idService: IdService;

	constructor(
		private moduleRef: ModuleRef,

		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.userPublickeysRepository)
		private userPublickeysRepository: UserPublickeysRepository,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private roleService: RoleService,
		private readonly httpRequestService: HttpRequestService,
		private readonly appLockService: AppLockService,
		private readonly cacheManagementService: CacheManagementService,
		private readonly utilityService: UtilityService,
		private readonly apUtilityService: ApUtilityService,
		private readonly timeService: TimeService,
		private readonly queueService: QueueService,
		private readonly collapsedQueueService: CollapsedQueueService,
		private readonly internalEventService: InternalEventService,

		apLoggerService: ApLoggerService,
	) {
		this.logger = apLoggerService.logger;

		this.uriPersonCache = this.cacheManagementService.createQuantumKVCache('uriPerson', {
			lifetime: 1000 * 60 * 30, // 30m
			fetcher: async (uri) => {
				const { id } = await this.usersRepository
					.createQueryBuilder('user')
					.select('user.id')
					.where({ uri })
					.getOneOrFail() as { id: string };
				return id;
			},
			optionalFetcher: async (uri) => {
				const res = await this.usersRepository
					.createQueryBuilder('user')
					.select('user.id')
					.where({ uri })
					.getOne() as { id: string } | null;
				return res?.id;
			},
			bulkFetcher: async (uris) => {
				const users = await this.usersRepository
					.createQueryBuilder('user')
					.select('user.id')
					.addSelect('user.uri')
					.where({ uri: In(uris) })
					.getMany() as { id: string, uri: string }[];
				return users.map(user => [user.uri, user.id]);
			},
		});

		this.publicKeyByKeyIdCache = this.cacheManagementService.createQuantumKVCache<MiUserPublickey>('publicKeyByKeyId', {
			lifetime: 1000 * 60 * 60 * 12, // 12h
			fetcher: async (keyId) => await this.userPublickeysRepository.findOneByOrFail({ keyId }),
			optionalFetcher: async (keyId) => await this.userPublickeysRepository.findOneBy({ keyId }),
			bulkFetcher: async (keyIds) => {
				const publicKeys = await this.userPublickeysRepository.findBy({ keyId: In(keyIds) });
				return publicKeys.map(k => [k.keyId, k]);
			},
		});

		this.publicKeyByUserIdCache = this.cacheManagementService.createQuantumKVCache<MiUserPublickey>('publicKeyByUserId', {
			lifetime: 1000 * 60 * 60 * 12, // 12h
			fetcher: async (userId) => await this.userPublickeysRepository.findOneByOrFail({ userId }),
			optionalFetcher: async (userId) => await this.userPublickeysRepository.findOneBy({ userId }),
			bulkFetcher: async (userIds) => {
				const publicKeys = await this.userPublickeysRepository.findBy({ userId: In(userIds) });
				return publicKeys.map(k => [k.userId, k]);
			},
		});
	}

	@bindThis
	onModuleInit(): void {
		this.driveFileEntityService = this.moduleRef.get('DriveFileEntityService');
		this.federatedInstanceService = this.moduleRef.get('FederatedInstanceService');
		this.fetchInstanceMetadataService = this.moduleRef.get('FetchInstanceMetadataService');
		this.cacheService = this.moduleRef.get('CacheService');
		this.apResolverService = this.moduleRef.get('ApResolverService');
		this.apNoteService = this.moduleRef.get('ApNoteService');
		this.apImageService = this.moduleRef.get('ApImageService');
		this.apMfmService = this.moduleRef.get('ApMfmService');
		this.mfmService = this.moduleRef.get('MfmService');
		this.hashtagService = this.moduleRef.get('HashtagService');
		this.usersChart = this.moduleRef.get('UsersChart');
		this.instanceChart = this.moduleRef.get('InstanceChart');
		this.accountMoveService = this.moduleRef.get('AccountMoveService');
		this.idService = this.moduleRef.get('IdService');
	}

	/**
	 * Validate and convert to actor object
	 * @param x Fetched object
	 * @param uri Fetch target URI
	 */
	@bindThis
	private validateActor(x: IObject, uri: string): IActor {
		const parsedUri = this.utilityService.assertUrl(uri);
		const expectHost = this.utilityService.punyHostPSLDomain(parsedUri);

		// Validate type
		if (!isActor(x)) {
			throw new UnrecoverableError(`invalid Actor ${uri}: unknown type '${x.type}'`);
		}

		// Validate id
		if (!x.id) {
			throw new UnrecoverableError(`invalid Actor ${uri}: missing id`);
		}
		if (typeof(x.id) !== 'string') {
			throw new UnrecoverableError(`invalid Actor ${uri}: wrong id type ${typeof(x.id)}`);
		}
		const parsedId = this.utilityService.assertUrl(x.id);
		const idHost = this.utilityService.punyHostPSLDomain(parsedId);
		if (idHost !== expectHost) {
			throw new UnrecoverableError(`invalid Actor ${uri}: wrong host in id ${x.id} (got ${parsedId}, expected ${expectHost})`);
		}

		// Validate inbox
		this.apUtilityService.sanitizeInlineObject(x, 'inbox', parsedUri, expectHost);
		if (!x.inbox || typeof(x.inbox) !== 'string') {
			throw new UnrecoverableError(`invalid Actor ${uri}: missing or invalid inbox ${x.inbox}`);
		}

		// Sanitize sharedInbox
		this.apUtilityService.sanitizeInlineObject(x, 'sharedInbox', parsedUri, expectHost);

		// Sanitize endpoints object
		if (typeof(x.endpoints) === 'object') {
			x.endpoints = {
				sharedInbox: x.endpoints.sharedInbox,
			};
		} else {
			x.endpoints = undefined;
		}

		// Sanitize endpoints.sharedInbox
		if (x.endpoints) {
			this.apUtilityService.sanitizeInlineObject(x.endpoints, 'sharedInbox', parsedUri, expectHost, 'endpoints.');

			if (!x.endpoints.sharedInbox) {
				x.endpoints = undefined;
			}
		}

		// Sanitize collections
		for (const collection of ['outbox', 'followers', 'following', 'featured'] as const) {
			this.apUtilityService.sanitizeInlineObject(x, collection, parsedUri, expectHost);
		}

		// Validate username
		if (!(typeof x.preferredUsername === 'string' && x.preferredUsername.length > 0 && x.preferredUsername.length <= 128 && /^\w([\w-.]*\w)?$/.test(x.preferredUsername))) {
			throw new UnrecoverableError(`invalid Actor ${uri}: wrong username`);
		}

		// Sanitize name
		// These fields are only informational, and some AP software allows these
		// fields to be very long. If they are too long, we cut them off. This way
		// we can at least see these users and their activities.
		if (!x.name) {
			x.name = undefined;
		} else if (typeof(x.name) !== 'string') {
			this.logger.warn(`Excluding name from object ${uri}: incorrect type ${typeof(x)}`);
			x.name = undefined;
		} else {
			x.name = truncate(x.name, nameLength);
		}

		// Sanitize summary
		if (!x.summary) {
			x.summary = undefined;
		} else if (typeof(x.summary) !== 'string') {
			this.logger.warn(`Excluding summary from object ${uri}: incorrect type ${typeof(x)}`);
		} else {
			x.summary = truncate(x.summary, this.config.maxRemoteBioLength);
		}

		// Sanitize publicKey
		this.apUtilityService.sanitizeInlineObject(x, 'publicKey', parsedUri, expectHost);

		return x;
	}

	/**
	 * uriからUser(Person)をフェッチします。
	 *
	 * Misskeyに対象のPersonが登録されていればそれを返し、登録がなければnullを返します。
	 */
	@bindThis
	public async fetchPerson(uri: string, opts?: { withDeleted?: boolean, withSuspended?: boolean }): Promise<MiLocalUser | MiRemoteUser | null> {
		const _opts = {
			withDeleted: opts?.withDeleted ?? false,
			withSuspended: opts?.withSuspended ?? true,
		};

		let userId: string | null | undefined;

		// Resolve URI -> User ID
		const parsed = this.utilityService.parseUri(uri);
		if (parsed.local) {
			userId = parsed.type === 'users' ? parsed.id : null;
		} else {
			userId = await this.uriPersonCache.fetchMaybe(uri);
		}

		// No match
		if (!userId) {
			return null;
		}

		const user = await this.cacheService.findOptionalUserById(userId) as MiLocalUser | MiRemoteUser | null;

		if (user?.isDeleted && !_opts.withDeleted) {
			return null;
		}
		if (user?.isSuspended && !_opts.withSuspended) {
			return null;
		}

		return user;
	}

	// TODO fix these "any" types
	private async resolveAvatarAndBanner(user: MiRemoteUser, icon: any, image: any, bgimg: any): Promise<Partial<Pick<MiRemoteUser, 'avatarId' | 'bannerId' | 'backgroundId' | 'avatarUrl' | 'bannerUrl' | 'backgroundUrl' | 'avatarBlurhash' | 'bannerBlurhash' | 'backgroundBlurhash'>>> {
		const [avatar, banner, background] = await Promise.all([icon, image, bgimg].map(async img => {
			// icon and image may be arrays
			// see https://www.w3.org/TR/activitystreams-vocabulary/#dfn-icon
			if (Array.isArray(img)) {
				img = img.find(item => item && item.url) ?? null;
			}

			// if we have an explicitly missing image, return an
			// explicitly-null set of values
			if ((img == null) || (typeof img === 'object' && img.url == null)) {
				return { id: null, url: null, blurhash: null };
			}

			return await this.apImageService.resolveImage(user, img).catch(() => null);
		}));

		if (((avatar != null && avatar.id != null) || (banner != null && banner.id != null))
				&& !(await this.roleService.getUserPolicies(user.id)).canUpdateBioMedia) {
			return {};
		}

		/*
			we don't want to return nulls on errors! if the database fields
			are already null, nothing changes; if the database has old
			values, we should keep those. The exception is if the remote has
			actually removed the images: in that case, the block above
			returns the special {id:null}&c value, and we return those
		*/
		return {
			...( avatar ? {
				avatarId: avatar.id,
				avatarUrl: avatar.url ? this.driveFileEntityService.getPublicUrl(avatar, 'avatar') : null,
				avatarBlurhash: avatar.blurhash,
			} : {}),
			...( banner ? {
				bannerId: banner.id,
				bannerUrl: banner.url ? this.driveFileEntityService.getPublicUrl(banner) : null,
				bannerBlurhash: banner.blurhash,
			} : {}),
			...( background ? {
				backgroundId: background.id,
				backgroundUrl: background.url ? this.driveFileEntityService.getPublicUrl(background) : null,
				backgroundBlurhash: background.blurhash,
			} : {}),
		};
	}

	/**
	 * Personを作成します。
	 */
	@bindThis
	public async createPerson(uri: string, resolver?: Resolver): Promise<MiRemoteUser> {
		if (typeof uri !== 'string') throw new UnrecoverableError(`failed to create user ${uri}: input is not string`);

		const host = this.utilityService.punyHost(uri);
		if (host === this.utilityService.toPuny(this.config.host)) {
			throw new UnrecoverableError(`failed to create user ${uri}: URI is local`);
		}

		return await this._createPerson(uri, resolver);
	}

	private async _createPerson(value: string | IObject, resolver?: Resolver): Promise<MiRemoteUser> {
		const uri = getApId(value);
		const host = this.utilityService.punyHost(uri);

		resolver ??= this.apResolverService.createResolver();

		const object = await resolver.resolve(value);
		const person = this.validateActor(object, uri);

		this.logger.info(`Creating the Person: ${person.id}`);

		const fields = this.analyzeAttachments(person.attachment ?? []);

		const tags = extractApHashtags(person.tag).map(normalizeForSearch).splice(0, 32);

		const isBot = getApType(object) === 'Service' || getApType(object) === 'Application';

		const [followingVisibility, followersVisibility] = await Promise.all(
			[
				this.isPublicCollection(person.following, resolver, uri),
				this.isPublicCollection(person.followers, resolver, uri),
			].map((p): Promise<'public' | 'private'> => p
				.then(isPublic => isPublic ? 'public' : 'private')
				.catch(err => {
					// Permanent error implies hidden or inaccessible, which is a normal thing.
					if (isRetryableError(err)) {
						this.logger.error(`error occurred while fetching following/followers collection: ${renderInlineError(err)}`);
					}

					return 'private';
				}),
			),
		);

		const bday = person['vcard:bday']?.match(/^\d{4}-\d{2}-\d{2}/);

		if (person.id == null) {
			throw new UnrecoverableError(`failed to create user ${uri}: missing ID`);
		}

		const url = this.apUtilityService.findBestObjectUrl(person);

		const profileUrls = url ? [url, person.id] : [person.id];
		const verifiedLinks = await verifyFieldLinks(fields, profileUrls, this.httpRequestService);

		// Create user
		let user: MiRemoteUser | null = null;
		let publicKey: MiUserPublickey | null = null;

		//#region カスタム絵文字取得
		const emojis = await this.apNoteService.extractEmojis(person.tag ?? [], host)
			.then(_emojis => _emojis.map(emoji => emoji.name))
			.catch(err => {
				// Permanent error implies hidden or inaccessible, which is a normal thing.
				if (isRetryableError(err)) {
					this.logger.error(`error occurred while fetching user emojis: ${renderInlineError(err)}`);
				}
				return [];
			});
		//#endregion

		//#region resolve counts
		const outboxCollection = person.outbox
			? await resolver.resolveCollection(person.outbox, true, uri).catch(() => { return null; })
			: null;
		const followersCollection = person.followers
			? await resolver.resolveCollection(person.followers, true, uri).catch(() => { return null; })
			: null;
		const followingCollection = person.following
			? await resolver.resolveCollection(person.following, true, uri).catch(() => { return null; })
			: null;

		// Register the instance first, to avoid FK errors
		await this.federatedInstanceService.fetchOrRegister(host);

		try {
			// Start transaction
			await this.db.transaction(async transactionalEntityManager => {
				user = await transactionalEntityManager.save(new MiUser({
					id: this.idService.gen(),
					avatarId: null,
					bannerId: null,
					backgroundId: null,
					lastFetchedAt: this.timeService.date,
					name: truncate(person.name, nameLength),
					noindex: (person as any).noindex ?? false,
					enableRss: person.enableRss === true,
					isLocked: person.manuallyApprovesFollowers,
					movedToUri: person.movedTo,
					movedAt: person.movedTo ? this.timeService.date : null,
					alsoKnownAs: person.alsoKnownAs,
					// We use "!== false" to handle incorrect types, missing / null values, and "default to true" logic.
					hideOnlineStatus: person.hideOnlineStatus !== false,
					isExplorable: person.discoverable !== false,
					username: person.preferredUsername,
					approved: true,
					usernameLower: person.preferredUsername?.toLowerCase(),
					host,
					inbox: person.inbox,
					sharedInbox: person.sharedInbox ?? person.endpoints?.sharedInbox ?? null,
					notesCount: outboxCollection?.totalItems ?? 0,
					followersCount: followersCollection?.totalItems ?? 0,
					followingCount: followingCollection?.totalItems ?? 0,
					followersUri: person.followers ? getApId(person.followers) : undefined,
					featured: person.featured ? getApId(person.featured) : undefined,
					uri: person.id,
					tags,
					isBot,
					isCat: (person as any).isCat === true,
					speakAsCat: (person as any).speakAsCat != null ? (person as any).speakAsCat === true : (person as any).isCat === true,
					requireSigninToViewContents: (person as any).requireSigninToViewContents === true,
					makeNotesFollowersOnlyBefore: (person as any).makeNotesFollowersOnlyBefore ?? null,
					makeNotesHiddenBefore: (person as any).makeNotesHiddenBefore ?? null,
					emojis,
					attributionDomains: Array.isArray(person.attributionDomains)
						? person.attributionDomains
							.filter((a: unknown) => typeof(a) === 'string' && a.length > 0 && a.length <= 128)
							.slice(0, 32)
						: [],
				})) as MiRemoteUser;

				let _description: string | null = null;

				if (person._misskey_summary) {
					_description = truncate(person._misskey_summary, this.config.maxRemoteBioLength);
				} else if (person.summary) {
					_description = this.apMfmService.htmlToMfm(truncate(person.summary, this.config.maxRemoteBioLength), person.tag);
				}

				await transactionalEntityManager.save(new MiUserProfile({
					userId: user.id,
					description: _description,
					followedMessage: person._misskey_followedMessage != null ? truncate(person._misskey_followedMessage, 256) : null,
					url,
					fields,
					verifiedLinks,
					followingVisibility,
					followersVisibility,
					birthday: bday?.[0] ?? null,
					location: person['vcard:Address'] ?? null,
					userHost: host,
					listenbrainz: person.listenbrainz ?? null,
				}));

				if (person.publicKey) {
					publicKey = await transactionalEntityManager.save(new MiUserPublickey({
						userId: user.id,
						keyId: person.publicKey.id,
						keyPem: person.publicKey.publicKeyPem.trim(),
					}));
				}
			});
		} catch (e) {
			// duplicate key error
			if (isDuplicateKeyValueError(e)) {
				// /users/@a => /users/:id のように入力がaliasなときにエラーになることがあるのを対応
				const u = await this.usersRepository.findOneBy({ uri: person.id });
				if (u == null) throw new UnrecoverableError(`already registered a user with conflicting data: ${uri}`);

				user = u as MiRemoteUser;
				publicKey = await this.userPublickeysRepository.findOneBy({ userId: user.id });
			} else {
				this.logger.error(`Error creating Person ${uri}: ${renderInlineError(e)}`);
				throw e;
			}
		}

		if (user == null) throw new Error(`failed to create user - user is null: ${uri}`);

		// Register to the cache
		await this.uriPersonCache.set(user.uri, user.id);

		// Register public key to the cache.
		if (publicKey) {
			await Promise.all([
				this.publicKeyByKeyIdCache.set(publicKey.keyId, publicKey),
				this.publicKeyByUserIdCache.set(publicKey.userId, publicKey),
			]);
		}

		// Register host
		if (this.meta.enableStatsForFederatedInstances) {
			this.federatedInstanceService.fetchOrRegister(host).then(async i => {
				await this.collapsedQueueService.updateInstanceQueue.enqueue(i.id, { usersCountDelta: 1 });
				if (this.meta.enableChartsForFederatedInstances) {
					this.instanceChart.newUser(i.host);
				}
				await this.fetchInstanceMetadataService.fetchInstanceMetadataLazy(i);
			});
		}

		this.usersChart.update(user, true);

		//#region アバターとヘッダー画像をフェッチ
		try {
			const updates = await this.resolveAvatarAndBanner(user, person.icon, person.image, person.backgroundUrl);
			await this.usersRepository.update(user.id, updates);
			await this.internalEventService.emit('remoteUserUpdated', { id: user.id });
			user = { ...user, ...updates };
		} catch (err) {
			// Permanent error implies hidden or inaccessible, which is a normal thing.
			if (isRetryableError(err)) {
				this.logger.error(`error occurred while fetching user avatar/banner: ${renderInlineError(err)}`);
			}
		}
		//#endregion

		// ハッシュタグ更新
		await this.queueService.createUpdateUserTagsJob(user.id);

		await this.updateFeaturedLazy(user);

		return user;
	}

	/**
	 * Schedules a deferred update on the background task worker.
	 * Duplicate updates are automatically skipped.
	 */
	@bindThis
	public async updatePersonLazy(uriOrUser: string | MiUser): Promise<void> {
		const user = typeof(uriOrUser) === 'string'
			?	await this.fetchPerson(uriOrUser)
			: uriOrUser;

		if (user && user.host != null) {
			await this.queueService.createUpdateUserJob(user.id);
		}
	}

	/**
	 * Personの情報を更新します。
	 * Misskeyに対象のPersonが登録されていなければ無視します。
	 * もしアカウントの移行が確認された場合、アカウント移行処理を行います。
	 *
	 * @param uri URI of Person
	 * @param resolver Resolver
	 * @param hint Hint of Person object (この値が正当なPersonの場合、Remote resolveをせずに更新に利用します)
	 * @param movePreventUris ここに指定されたURIがPersonのmovedToに指定されていたり10回より多く回っている場合これ以上アカウント移行を行わない（無限ループ防止）
	 */
	@bindThis
	public async updatePerson(uri: string, resolver?: Resolver | null, hint?: IObject, movePreventUris: string[] = []): Promise<string | void> {
		if (typeof uri !== 'string') throw new UnrecoverableError(`failed to update user ${uri}: input is not string`);

		// URIがこのサーバーを指しているならスキップ
		if (this.utilityService.isUriLocal(uri)) return;

		//#region このサーバーに既に登録されているか
		const exist = await this.fetchPerson(uri) as MiRemoteUser | null;
		if (exist === null) return;
		//#endregion

		if (resolver == null) resolver = this.apResolverService.createResolver();

		const object = hint ?? await resolver.resolve(uri);

		const person = this.validateActor(object, uri);

		this.logger.info(`Updating the Person: ${person.id}`);

		// カスタム絵文字取得
		const emojis = await this.apNoteService.extractEmojis(person.tag ?? [], exist.host).catch(err => {
			// Permanent error implies hidden or inaccessible, which is a normal thing.
			if (isRetryableError(err)) {
				this.logger.error(`error occurred while fetching user emojis: ${renderInlineError(err)}`);
			}
			return [];
		});

		const emojiNames = emojis.map(emoji => emoji.name);

		const fields = this.analyzeAttachments(person.attachment ?? []);

		const tags = extractApHashtags(person.tag).map(normalizeForSearch).splice(0, 32);

		const [followingVisibility, followersVisibility] = await Promise.all(
			[
				this.isPublicCollection(person.following, resolver, exist.uri),
				this.isPublicCollection(person.followers, resolver, exist.uri),
			].map((p): Promise<'public' | 'private' | undefined> => p
				.then(isPublic => isPublic ? 'public' : 'private')
				.catch(err => {
					// Permanent error implies hidden or inaccessible, which is a normal thing.
					if (isRetryableError(err)) {
						this.logger.error(`error occurred while fetching following/followers collection: ${renderInlineError(err)}`);
						// Do not update the visibility on transient errors.
						return undefined;
					}

					return 'private';
				}),
			),
		);

		const bday = person['vcard:bday']?.match(/^\d{4}-\d{2}-\d{2}/);

		if (person.id == null) {
			throw new UnrecoverableError(`failed to update user ${uri}: missing ID`);
		}

		const url = this.apUtilityService.findBestObjectUrl(person);

		const profileUrls = url ? [url, person.id] : [person.id];
		const verifiedLinks = await verifyFieldLinks(fields, profileUrls, this.httpRequestService);
		const featuredUri = person.featured ? getApId(person.featured) : undefined;

		const updates = {
			lastFetchedAt: this.timeService.date,
			inbox: person.inbox,
			sharedInbox: person.sharedInbox ?? person.endpoints?.sharedInbox ?? null,
			followersUri: person.followers ? getApId(person.followers) : undefined,
			// If the featured collection changes, then reset the fetch timeout.
			lastFetchedFeaturedAt: featuredUri !== exist.featured ? null : undefined,
			featured: featuredUri,
			emojis: emojiNames,
			name: truncate(person.name, nameLength),
			tags,
			approved: true,
			isBot: getApType(object) === 'Service' || getApType(object) === 'Application',
			isCat: (person as any).isCat === true,
			speakAsCat: (person as any).speakAsCat != null ? (person as any).speakAsCat === true : (person as any).isCat === true,
			noindex: (person as any).noindex ?? false,
			enableRss: person.enableRss === true,
			isLocked: person.manuallyApprovesFollowers,
			movedToUri: person.movedTo ?? null,
			alsoKnownAs: person.alsoKnownAs ?? null,
			// We use "!== false" to handle incorrect types, missing / null values, and "default to true" logic.
			hideOnlineStatus: person.hideOnlineStatus !== false,
			isExplorable: person.discoverable !== false,
			attributionDomains: Array.isArray(person.attributionDomains)
				? person.attributionDomains
					.filter((a: unknown) => typeof(a) === 'string' && a.length > 0 && a.length <= 128)
					.slice(0, 32)
				: [],
			...(await this.resolveAvatarAndBanner(exist, person.icon, person.image, person.backgroundUrl).catch(err => {
				// Permanent error implies hidden or inaccessible, which is a normal thing.
				if (isRetryableError(err)) {
					this.logger.error(`error occurred while fetching user avatar/banner: ${renderInlineError(err)}`);
				}

				// Can't return null or destructuring operator will break
				return {};
			})),
		} as Partial<MiRemoteUser> & Pick<MiRemoteUser, 'isBot' | 'isCat' | 'speakAsCat' | 'isLocked' | 'movedToUri' | 'alsoKnownAs' | 'isExplorable'>;

		const moving = ((): boolean => {
			// 移行先がない→ある
			if (
				exist.movedToUri === null &&
				updates.movedToUri
			) return true;

			// 移行先がある→別のもの
			if (
				exist.movedToUri !== null &&
				updates.movedToUri !== null &&
				exist.movedToUri !== updates.movedToUri
			) return true;

			// 移行先がある→ない、ない→ないは無視
			return false;
		})();

		if (moving) updates.movedAt = this.timeService.date;

		// Update user
		if (!(await this.usersRepository.update({ id: exist.id, isDeleted: false }, updates)).affected) {
			return `skip: user ${exist.id} is deleted`;
		}

		// Notify event ASAP
		await this.internalEventService.emit('remoteUserUpdated', { id: exist.id });

		// Do not use "exist" after this point!!
		const updated = { ...exist, ...updates };

		if (person.publicKey) {
			const publicKey = new MiUserPublickey({
				userId: updated.id,
				keyId: person.publicKey.id,
				keyPem: person.publicKey.publicKeyPem,
			});

			// Create or update key
			await this.userPublickeysRepository.save(publicKey);

			// Save it to the cache
			await Promise.all([
				this.publicKeyByKeyIdCache.set(publicKey.keyId, publicKey),
				this.publicKeyByUserIdCache.set(publicKey.userId, publicKey),
			]);
		} else {
			const existingPublicKey = await this.userPublickeysRepository.findOneBy({ userId: updated.id });
			if (existingPublicKey) {
				// Delete key
				await Promise.all([
					this.userPublickeysRepository.delete({ userId: existingPublicKey.userId }),
					this.publicKeyByUserIdCache.delete(existingPublicKey.userId),
					this.publicKeyByKeyIdCache.delete(existingPublicKey.keyId),
				]);
			}
		}

		let _description: string | null = null;

		if (person._misskey_summary) {
			_description = truncate(person._misskey_summary, this.config.maxRemoteBioLength);
		} else if (person.summary) {
			_description = this.apMfmService.htmlToMfm(truncate(person.summary, this.config.maxRemoteBioLength), person.tag);
		}

		await this.userProfilesRepository.update({ userId: updated.id }, {
			url,
			fields,
			verifiedLinks,
			description: _description,
			followedMessage: person._misskey_followedMessage != null ? truncate(person._misskey_followedMessage, 256) : null,
			followingVisibility,
			followersVisibility,
			birthday: bday?.[0] ?? null,
			location: person['vcard:Address'] ?? null,
			listenbrainz: person.listenbrainz ?? null,
		});
		await this.cacheService.userProfileCache.delete(updated.id);

		// 該当ユーザーが既にフォロワーになっていた場合はFollowingもアップデートする
		if (updated.inbox !== person.inbox || updated.sharedInbox !== (person.sharedInbox ?? person.endpoints?.sharedInbox)) {
			await this.followingsRepository.update(
				{ followerId: updated.id },
				{
					followerInbox: person.inbox,
					followerSharedInbox: person.sharedInbox ?? person.endpoints?.sharedInbox ?? null,
				},
			);

			await this.cacheService.refreshFollowRelationsFor(updated.id);
		}

		// ハッシュタグ更新
		await this.queueService.createUpdateUserTagsJob(updated.id);

		await this.updateFeaturedLazy(updated);

		// 移行処理を行う
		if (updated.movedAt && (
			// 初めて移行する場合はmovedAtがnullなので移行処理を許可
			exist.movedAt == null ||
			// 以前のmovingから14日以上経過した場合のみ移行処理を許可
			// （Mastodonのクールダウン期間は30日だが若干緩めに設定しておく）
			exist.movedAt.getTime() + 1000 * 60 * 60 * 24 * 14 < updated.movedAt.getTime()
		)) {
			this.logger.info(`Start to process Move of @${updated.username}@${updated.host} (${uri})`);
			return this.processRemoteMove(updated, movePreventUris)
				.then(result => {
					this.logger.info(`Processing Move Finished [${result}] @${updated.username}@${updated.host} (${uri})`);
					return result;
				})
				.catch(e => {
					this.logger.info(`Processing Move Failed @${updated.username}@${updated.host} (${uri}): ${renderInlineError(e)}`);
				});
		}

		return 'skip: too soon to migrate accounts';
	}

	/**
	 * Personを解決します。
	 *
	 * Misskeyに対象のPersonが登録されていればそれを返し、そうでなければ
	 * リモートサーバーからフェッチしてMisskeyに登録しそれを返します。
	 */
	@bindThis
	public async resolvePerson(value: string | IObject, resolver?: Resolver, sentFrom?: string): Promise<MiLocalUser | MiRemoteUser> {
		const uri = getApId(value);

		if (!this.utilityService.isFederationAllowedUri(uri)) {
			throw new IdentifiableError('590719b3-f51f-48a9-8e7d-6f559ad00e5d', `failed to resolve person ${uri}: host is blocked`);
		}

		//#region このサーバーに既に登録されていたらそれを返す
		const exist = await this.fetchPerson(uri, { withDeleted: true });
		if (exist) return exist;
		//#endregion

		// Bail if local URI doesn't exist
		if (this.utilityService.isUriLocal(uri)) {
			throw new IdentifiableError('efb573fd-6b9e-4912-9348-a02f5603df4f', `failed to resolve person ${uri}: URL is local and does not exist`);
		}

		const unlock = await this.appLockService.getApLock(uri);

		try {
			// Optimization: we can avoid re-fetching the value *if and only if* it matches the host authority that it was sent from.
			// Instances can create any object within their host authority, but anything outside of that MUST be untrusted.
			const haveSameAuthority = sentFrom && this.apUtilityService.haveSameAuthority(sentFrom, uri);
			const createFrom = haveSameAuthority ? value : uri;
			return await this._createPerson(createFrom, resolver);
		} finally {
			await unlock();
		}
	}

	@bindThis
	// TODO: `attachments`が`IObject`だった場合、返り値が`[]`になるようだが構わないのか？
	public analyzeAttachments(attachments: IObject | IObject[] | undefined): Field[] {
		const fields: Field[] = [];

		if (Array.isArray(attachments)) {
			for (const attachment of attachments.filter(isPropertyValue)) {
				fields.push({
					name: attachment.name,
					value: this.mfmService.fromHtml(attachment.value),
				});
			}
		}

		return fields;
	}

	/**
	 * Schedules a deferred update on the background task worker.
	 * Duplicate updates are automatically skipped.
	 */
	@bindThis
	public async updateFeaturedLazy(userOrId: MiRemoteUser | MiUser['id']): Promise<void> {
		const userId = typeof(userOrId) === 'object' ? userOrId.id : userOrId;
		const user = typeof(userOrId) === 'object' ? userOrId : await this.cacheService.findRemoteUserById(userId);

		if (user.isDeleted || user.isSuspended) {
			this.logger.debug(`Not updating featured for ${userId}: user is deleted`);
			return;
		}

		if (!user.featured) {
			this.logger.debug(`Not updating featured for ${userId}: no featured collection`);
			return;
		}

		await this.queueService.createUpdateFeaturedJob(userId);
	}

	@bindThis
	public async updateFeatured(userOrId: MiRemoteUser | MiUser['id'], resolver?: Resolver): Promise<void> {
		const userId = typeof(userOrId) === 'object' ? userOrId.id : userOrId;
		const user = typeof(userOrId) === 'object' ? userOrId : await this.cacheService.findRemoteUserById(userId);

		if (user.isDeleted) throw new IdentifiableError(errorCodes.userIsDeleted, `Can't update featured for ${userId}: user is deleted`);
		if (user.isSuspended) throw new IdentifiableError(errorCodes.userIsSuspended, `Can't update featured for ${userId}: user is suspended`);
		if (!user.featured) throw new IdentifiableError(errorCodes.noFeaturedCollection, `Can't update featured for ${userId}: no featured collection`);

		this.logger.info(`Updating featured notes for: ${user.uri}`);

		resolver ??= this.apResolverService.createResolver();

		// Mark as updated
		await this.usersRepository.update({ id: userId }, { lastFetchedFeaturedAt: this.timeService.date });
		await this.internalEventService.emit('remoteUserUpdated', { id: userId });

		// Resolve and regist Notes
		const maxPinned = (await this.roleService.getUserPolicies(user.id)).pinLimit;
		const items = await resolver.resolveCollectionItems(user.featured, true, user.uri, maxPinned, 2);
		const featuredNotes = await promiseMap(items, async item => {
			const itemId = getNullableApId(item);
			if (itemId && isPost(item)) {
				try {
					const note = await this.apNoteService.resolveNote(item, {
						resolver: resolver,
						sentFrom: itemId, // resolveCollectionItems has already verified this, so we can re-use it to avoid double fetch
					});

					if (note && note.userId !== user.id) {
						this.logger.warn(`Ignoring cross-note pin: user ${user.id} tried to pin note ${note.id} belonging to other user ${note.userId}`);
						return null;
					}

					return note;
				} catch (err) {
					this.logger.warn(`Couldn't fetch pinned note ${itemId} for user ${user.id} (@${user.username}@${user.host}): ${renderInlineError(err)}`);
				}
			}
			return null;
		}, {
			limit: 2,
		});

		await this.db.transaction(async transactionalEntityManager => {
			await transactionalEntityManager.delete(MiUserNotePining, { userId: user.id });

			// とりあえずidを別の時間で生成して順番を維持
			let td = 0;
			for (const note of featuredNotes.filter(x => x != null)) {
				td -= 1000;
				await transactionalEntityManager.insert(MiUserNotePining, {
					id: this.idService.gen(this.timeService.now + td),
					userId: user.id,
					noteId: note.id,
				});
			}
		});
	}

	/**
	 * リモート由来のアカウント移行処理を行います
	 * @param src 移行元アカウント（リモートかつupdatePerson後である必要がある、というかこれ自体がupdatePersonで呼ばれる前提）
	 * @param movePreventUris ここに列挙されたURIにsrc.movedToUriが含まれる場合、移行処理はしない（無限ループ防止）
	 */
	@bindThis
	private async processRemoteMove(src: MiRemoteUser, movePreventUris: string[] = []): Promise<string> {
		if (!src.movedToUri) return 'skip: no movedToUri';
		if (src.uri === src.movedToUri) return 'skip: movedTo itself (src)'; // ？？？
		if (movePreventUris.length > 10) return 'skip: too many moves';

		// まずサーバー内で検索して様子見
		let dst = await this.fetchPerson(src.movedToUri);

		if (dst && isLocalUser(dst)) {
			// TODO this branch should not be possible
			// targetがローカルユーザーだった場合データベースから引っ張ってくる
			dst = await this.usersRepository.findOneByOrFail({ uri: src.movedToUri }) as MiLocalUser;
		} else if (dst) {
			if (movePreventUris.includes(src.movedToUri)) return 'skip: circular move';

			// targetを見つけたことがあるならtargetをupdatePersonする
			await this.updatePerson(src.movedToUri, undefined, undefined, [...movePreventUris, src.uri]);
			dst = await this.fetchPerson(src.movedToUri) ?? dst;
		} else {
			if (this.utilityService.isUriLocal(src.movedToUri)) {
				// ローカルユーザーっぽいのにfetchPersonで見つからないということはmovedToUriが間違っている
				return 'failed: movedTo is local but not found';
			}

			// targetが知らない人だったらresolvePerson
			// (uriが存在しなかったり応答がなかったりする場合resolvePersonはthrow Errorする)
			dst = await this.resolvePerson(src.movedToUri);
		}

		if (dst.movedToUri === dst.uri) return 'skip: movedTo itself (dst)'; // ？？？
		if (src.movedToUri !== dst.uri) return 'skip: missmatch uri'; // ？？？
		if (dst.movedToUri === src.uri) return 'skip: dst.movedToUri === src.uri';
		if (!dst.alsoKnownAs || dst.alsoKnownAs.length === 0) {
			return 'skip: dst.alsoKnownAs is empty';
		}
		if (!dst.alsoKnownAs.includes(src.uri)) {
			return 'skip: alsoKnownAs does not include from.uri';
		}

		await this.queueService.createMoveJob(src, dst);

		return 'ok';
	}

	@bindThis
	private async isPublicCollection(collection: string | IObject | undefined, resolver: Resolver, sentFrom: string): Promise<boolean> {
		if (collection) {
			const resolved = await resolver.resolveCollection(collection, true, sentFrom);
			{
				if (resolved.first || (resolved as ICollection).items || (resolved as IOrderedCollection).orderedItems) {
					return true;
				}
			}
		}

		return false;
	}

	@bindThis
	public async findPublicKeyByUserId(userId: string): Promise<MiUserPublickey | null> {
		return await this.publicKeyByUserIdCache.fetchMaybe(userId) ?? null;
	}

	@bindThis
	public async findPublicKeyByKeyId(keyId: string): Promise<MiUserPublickey | null> {
		return await this.publicKeyByKeyIdCache.fetchMaybe(keyId) ?? null;
	}
}
