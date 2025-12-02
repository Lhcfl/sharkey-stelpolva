/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull, Not } from 'typeorm';
import type { MiLocalUser, MiRemoteUser } from '@/models/User.js';
import type { NotesRepository, PollsRepository, NoteReactionsRepository, UsersRepository, FollowRequestsRepository, MiMeta, SkApFetchLog } from '@/models/_.js';
import type { Config } from '@/config.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { DI } from '@/di-symbols.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import { fromTuple } from '@/misc/from-tuple.js';
import { ApLogService, calculateDurationSince, extractObjectContext } from '@/core/ApLogService.js';
import { ApUtilityService } from '@/core/activitypub/ApUtilityService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { toArray } from '@/misc/prelude/array.js';
import { isPureRenote } from '@/misc/is-renote.js';
import { CacheService } from '@/core/CacheService.js';
import { promiseMap } from '@/misc/promise-map.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { AnyCollection, getApId, getNullableApId, IObjectWithId, isCollection, isCollectionOrOrderedCollection, isCollectionPage, isOrderedCollection, isOrderedCollectionPage } from './type.js';
import { ApDbResolverService } from './ApDbResolverService.js';
import { ApRendererService } from './ApRendererService.js';
import { ApRequestService } from './ApRequestService.js';
import type { IObject, ApObject, IAnonymousObject } from './type.js';

export class Resolver {
	protected readonly history: Set<string>;
	private user?: MiLocalUser;
	private logger: Logger;

	constructor(
		private config: Config,
		private meta: MiMeta,
		private usersRepository: UsersRepository,
		private notesRepository: NotesRepository,
		private pollsRepository: PollsRepository,
		private noteReactionsRepository: NoteReactionsRepository,
		private followRequestsRepository: FollowRequestsRepository,
		private utilityService: UtilityService,
		private systemAccountService: SystemAccountService,
		private apRequestService: ApRequestService,
		private httpRequestService: HttpRequestService,
		private apRendererService: ApRendererService,
		private apDbResolverService: ApDbResolverService,
		private loggerService: LoggerService,
		private readonly apLogService: ApLogService,
		private readonly apUtilityService: ApUtilityService,
		private readonly cacheService: CacheService,
		protected readonly recursionLimit = 256,
	) {
		this.history = new Set();
		this.logger = this.loggerService.getLogger('ap-resolve');
	}

	@bindThis
	public getHistory(): string[] {
		return Array.from(this.history);
	}

	@bindThis
	public getRecursionLimit(): number {
		return this.recursionLimit;
	}

	@bindThis
	public async resolveCollection(value: string | IObject, allowAnonymous?: boolean, sentFromUri?: string): Promise<AnyCollection> {
		const collection = sentFromUri
			? await this.secureResolve(value, sentFromUri, allowAnonymous)
			: allowAnonymous
				? await this.resolveAnonymous(value)
				: await this.resolve(value, allowAnonymous);

		if (isCollectionOrOrderedCollection(collection)) {
			return collection;
		} else {
			throw new IdentifiableError('f100eccf-f347-43fb-9b45-96a0831fb635', `collection ${getNullableApId(value)} has unsupported type: ${collection.type}`);
		}
	}

	/**
	 * Recursively resolves items from a collection.
	 * Stops when reaching the resolution limit or an optional item limit - whichever is lower.
	 * This method supports Collection, OrderedCollection, and individual pages of either type.
	 * Malformed collections (mixing Ordered and un-Ordered types) are also supported.
	 * @param collection Collection to resolve from - can be a URL or object of any supported collection type.
	 * @param limit Maximum number of items to resolve. If null or undefined (default), then items will be resolved until reaching the recursion limit.
	 * @param allowAnonymous If true, collection items can be anonymous (lack an ID). If false (default), then an error is thrown when reaching an item without ID.
	 * @param sentFromUri If collection is an object, this is the URI where it was sent from.
	 * @param concurrency Maximum number of items to resolve at once. (default: 4)
	 * @param ignoreErrors If true (default), inaccessible items will be skipped instead of causing an exception. Inaccessible collections will still throw.
	 */
	@bindThis
	public async resolveCollectionItems(collection: string | IObject, allowAnonymous = false, sentFromUri?: string, limit?: number | null, concurrency = 4, ignoreErrors = true): Promise<IObject[]> {
		const resolvedItems: IObject[] = [];

		// This is pulled up to avoid code duplication below
		const iterate = async(items: ApObject, current: AnyCollection) => {
			const sentFrom = current.id;
			const itemArr = toArray(items);
			const itemLimit = limit ?? Number.MAX_SAFE_INTEGER;
			await this.resolveItemArray(itemArr, sentFrom, itemLimit, concurrency, allowAnonymous, resolvedItems, ignoreErrors);
		};

		let current: AnyCollection | null = await this.resolveCollection(collection, allowAnonymous, sentFromUri);
		do {
			// Iterate all items in the current page
			if (current.items) {
				await iterate(current.items, current);
			}
			if (current.orderedItems) {
				await iterate(current.orderedItems, current);
			}

			if (this.history.size >= this.recursionLimit) {
				// Stop when we reach the fetch limit
				current = null;
			} else if (limit != null && resolvedItems.length >= limit) {
				// Stop when we reach the item limit
				current = null;
			} else if (isCollection(current) || isOrderedCollection(current)) {
				// Continue to first page
				current = current.first ? await this.resolveCollection(current.first, allowAnonymous, current.id) : null;
			} else if (isCollectionPage(current) || isOrderedCollectionPage(current)) {
				// Continue to next page
				current = current.next ? await this.resolveCollection(current.next, allowAnonymous, current.id) : null;
			} else {
				// Stop in all other conditions
				current = null;
			}
		} while (current != null);

		return resolvedItems;
	}

	private async resolveItemArray(source: (string | IObject)[], sentFrom: string | undefined, itemLimit: number, concurrency: number, allowAnonymousItems: boolean, destination: IObject[], ignoreErrors?: boolean): Promise<void> {
		const recursionLimit = this.recursionLimit - this.history.size;
		const batchLimit = Math.min(source.length, recursionLimit, itemLimit);

		const batch = await promiseMap(source.slice(0, batchLimit), async item => {
			try {
				if (sentFrom) {
					// Use secureResolve to avoid re-fetching items that were included inline.
					return await this.secureResolve(item, sentFrom, allowAnonymousItems);
				} else if (allowAnonymousItems) {
					return await this.resolveAnonymous(item);
				} else {
					// ID is required if we have neither sentFrom not allowAnonymousItems
					const id = getApId(item);
					return await this.resolve(id);
				}
			} catch (err) {
				if (ignoreErrors) {
					this.logger.warn(`Ignoring error in collection item ${getNullableApId(item)}: ${renderInlineError(err)}`);
					return null;
				} else {
					throw err;
				}
			}
		}, {
			limit: concurrency,
		});

		// Items will be null if a request fails and ignoreErrors is true
		const batchItems = batch.filter(item => item != null);

		destination.push(...batchItems);
	};

	/**
	 * Securely resolves an AP object or URL that has been sent from another instance.
	 * An input object is trusted if and only if its ID matches the authority of sentFromUri.
	 * In all other cases, the object is re-fetched from remote by input string or object ID.
	 * @param input The input object or URL to resolve
	 * @param sentFromUri The URL where this object originated. This MUST be accurate - all security checks depend on this value!
	 * @param allowAnonymous If true, anonymous objects are allowed and will have their ID set to sentFromUri. If false (default) then anonymous objects will be rejected with an error.
	 */
	@bindThis
	public async secureResolve(input: string | IObject | [string | IObject], sentFromUri: string, allowAnonymous?: boolean): Promise<IObjectWithId> {
		// Unpack arrays to get the value element.
		const value = fromTuple(input);

		// If anonymous input is allowed, then any object is automatically valid if we set the ID.
		// We can short-circuit here and avoid un-necessary checks.
		if (allowAnonymous && typeof(value) === 'object' && value.id == null) {
			value.id = sentFromUri;
			return value as IObjectWithId;
		}

		// This ensures the input has a string ID, protecting against type confusion and rejecting anonymous objects.
		const id = getApId(value, sentFromUri);

		// Check if we can use the provided object as-is.
		// Our security requires that the object ID matches the host authority that sent it, otherwise it can't be trusted.
		// A mismatch isn't necessarily malicious, it just means we can't use the object we were given.
		if (typeof(value) === 'object' && this.apUtilityService.haveSameAuthority(id, sentFromUri)) {
			return value as IObjectWithId;
		}

		// If the checks didn't pass, then we must fetch the object and use that.
		return await this.resolve(id, allowAnonymous);
	}

	/**
	 * Resolves an anonymous object.
	 * The returned value will not have any ID present.
	 * If one is provided in the response, it will be removed automatically.
	 */
	@bindThis
	public async resolveAnonymous(value: string | IObject | [string | IObject]): Promise<IAnonymousObject> {
		value = fromTuple(value);

		const object = await this.resolve(value);
		object.id = undefined;

		return object as IAnonymousObject;
	}

	public async resolve(value: string | [string], allowAnonymous?: boolean): Promise<IObjectWithId>;
	public async resolve(value: string | IObjectWithId | [string | IObjectWithId], allowAnonymous?: boolean): Promise<IObjectWithId>;
	public async resolve(value: string | IObject | [string | IObject], allowAnonymous?: boolean): Promise<IObject>;
	/**
	 * Resolves a URL or object to an AP object.
	 * Tuples are expanded to their first element before anything else, and non-string inputs are returned as-is.
	 * Otherwise, the string URL is fetched and validated to represent a valid ActivityPub object.
	 * @param value The input value to resolve
	 * @param allowAnonymous Determines what to do if a response object lacks an ID field. If false (default), then an exception is thrown. If true, then the ID is populated from the final response URL.
	 */
	@bindThis
	public async resolve(value: string | IObject | [string | IObject], allowAnonymous = false): Promise<IObject> {
		value = fromTuple(value);

		// TODO try and remove this eventually, as it's a major security foot-gun
		if (typeof value !== 'string') {
			return value;
		}

		const host = this.utilityService.extractDbHost(value);
		if (this.config.activityLogging.enabled && !this.utilityService.isSelfHost(host)) {
			return await this._resolveLogged(value, host, allowAnonymous);
		} else {
			return await this._resolve(value, host, allowAnonymous);
		}
	}

	private async _resolveLogged(requestUri: string, host: string, allowAnonymous: boolean): Promise<IObjectWithId> {
		const startTime = process.hrtime.bigint();

		const log = await this.apLogService.createFetchLog({
			host: host,
			requestUri,
		});

		try {
			const result = await this._resolve(requestUri, host, allowAnonymous, log);

			log.accepted = true;
			log.result = 'ok';

			return result;
		} catch (err) {
			log.accepted = false;
			log.result = String(err);

			throw err;
		} finally {
			log.duration = calculateDurationSince(startTime);

			// Save or finalize asynchronously
			trackPromise(this.apLogService.saveFetchLog(log)
				.catch(err => this.logger.error('Failed to record AP object fetch:', err)));
		}
	}

	private async _resolve(value: string, host: string, allowAnonymous: boolean, log?: SkApFetchLog): Promise<IObjectWithId> {
		if (value.includes('#')) {
			// URLs with fragment parts cannot be resolved correctly because
			// the fragment part does not get transmitted over HTTP(S).
			// Avoid strange behaviour by not trying to resolve these at all.
			throw new IdentifiableError('b94fd5b1-0e3b-4678-9df2-dad4cd515ab2', `failed to resolve ${value}: URL contains fragment`);
		}

		if (this.history.has(value)) {
			throw new IdentifiableError('0dc86cf6-7cd6-4e56-b1e6-5903d62d7ea5', `failed to resolve ${value}: recursive resolution blocked`);
		}

		if (this.history.size > this.recursionLimit) {
			throw new IdentifiableError('d592da9f-822f-4d91-83d7-4ceefabcf3d2', `failed to resolve ${value}: hit recursion limit`);
		}

		this.history.add(value);

		if (this.utilityService.isSelfHost(host)) {
			return await this.resolveLocal(value) as IObjectWithId;
		}

		if (!this.utilityService.isFederationAllowedHost(host)) {
			throw new IdentifiableError('09d79f9e-64f1-4316-9cfa-e75c4d091574', `failed to resolve ${value}: instance ${host} is blocked`);
		}

		if (this.config.signToActivityPubGet && !this.user) {
			this.user = await this.systemAccountService.fetch('actor');
		}

		const object = (this.user
			? await this.apRequestService.signedGet(value, this.user, allowAnonymous)
			: await this.httpRequestService.getActivityJson(value, false, allowAnonymous));

		if (log) {
			const { object: objectOnly, context, contextHash } = extractObjectContext(object);
			const objectUri = getNullableApId(object);

			if (objectUri) {
				log.objectUri = objectUri;
				log.host = this.utilityService.extractDbHost(objectUri);
			}

			log.object = objectOnly;
			log.context = context;
			log.contextHash = contextHash;
		}

		if (
			Array.isArray(object['@context']) ?
				!(object['@context'] as unknown[]).includes('https://www.w3.org/ns/activitystreams') :
				object['@context'] !== 'https://www.w3.org/ns/activitystreams'
		) {
			throw new IdentifiableError('72180409-793c-4973-868e-5a118eb5519b', `failed to resolve ${value}: response does not have ActivityStreams context`);
		}

		// The object ID is already validated to match the final URL's authority by signedGet / getActivityJson.
		// We only need to validate that it also matches the original URL's authority, in case of redirects.
		const objectId = getApId(object, value);

		// We allow some limited cross-domain redirects, which means the host may have changed during fetch.
		// Additional checks are needed to validate the scope of cross-domain redirects.
		const finalHost = this.utilityService.extractDbHost(objectId);
		if (finalHost !== host) {
			// Make sure the redirect stayed within the same authority.
			this.apUtilityService.assertIdMatchesUrlAuthority(object, value);

			// Check if the redirect bounce from [allowed domain] to [blocked domain].
			if (!this.utilityService.isFederationAllowedHost(finalHost)) {
				throw new IdentifiableError('0a72bf24-2d9b-4f1d-886b-15aaa31adeda', `failed to resolve ${value}: redirected to blocked instance ${finalHost}`);
			}
		}

		return object;
	}

	// TODO try to remove this, as it creates a large attack surface
	@bindThis
	private resolveLocal(url: string): Promise<IObjectWithId> {
		const parsed = this.apDbResolverService.parseUri(url);
		if (!parsed.local) throw new IdentifiableError('02b40cd0-fa92-4b0c-acc9-fb2ada952ab8', `failed to resolve local ${url}: not a local URL`);

		switch (parsed.type) {
			case 'notes':
				return this.notesRepository.findOneOrFail({ where: { id: parsed.id, userHost: IsNull() }, relations: { user: true, renote: true } })
					.then(async note => {
						const author = note.user ?? await this.cacheService.findUserById(note.userId);
						if (parsed.rest === 'activity') {
							return await this.apRendererService.renderNoteOrRenoteActivity(note, author);
						} else if (!isPureRenote(note)) {
							const apNote = await this.apRendererService.renderNote(note, author);
							return this.apRendererService.addContext(apNote);
						} else {
							throw new IdentifiableError('732c2633-3395-4d51-a9b7-c7084774e3e7', `Failed to resolve local ${url}: cannot resolve a boost as note`);
						}
					}) as Promise<IObjectWithId>;
			case 'users':
				return this.cacheService.findLocalUserById(parsed.id)
					.then(user => this.apRendererService.renderPerson(user as MiLocalUser));
			case 'questions':
				// Polls are indexed by the note they are attached to.
				return Promise.all([
					this.notesRepository.findOneByOrFail({ id: parsed.id, userHost: IsNull() }),
					this.pollsRepository.findOneByOrFail({ noteId: parsed.id, userHost: IsNull() }),
				])
					.then(([note, poll]) => this.apRendererService.renderQuestion({ id: note.userId }, note, poll)) as Promise<IObjectWithId>;
			case 'likes':
				return this.noteReactionsRepository.findOneOrFail({ where: { id: parsed.id }, relations: { user: true } }).then(async reaction => {
					if (reaction.user?.host != null) {
						throw new IdentifiableError('02b40cd0-fa92-4b0c-acc9-fb2ada952ab8', `failed to resolve local ${url}: not a local reaction`);
					}
					return this.apRendererService.addContext(await this.apRendererService.renderLike(reaction, { uri: null }));
				});
			case 'follows':
				return this.followRequestsRepository.findOneBy({ id: parsed.id })
					.then(async followRequest => {
						if (followRequest == null) throw new IdentifiableError('a9d946e5-d276-47f8-95fb-f04230289bb0', `failed to resolve local ${url}: invalid follow request ID`);
						const [follower, followee] = await Promise.all([
							this.cacheService.findLocalUserById(followRequest.followerId),
							this.cacheService.findLocalUserById(followRequest.followeeId),
						]);
						if (follower == null || followee == null) {
							throw new IdentifiableError('06ae3170-1796-4d93-a697-2611ea6d83b6', `failed to resolve local ${url}: follower or followee does not exist`);
						}
						return this.apRendererService.addContext(this.apRendererService.renderFollow(follower as MiLocalUser | MiRemoteUser, followee as MiLocalUser | MiRemoteUser, url));
					});
			default:
				throw new IdentifiableError('7a5d2fc0-94bc-4db6-b8b8-1bf24a2e23d0', `failed to resolve local ${url}: unsupported type ${parsed.type}`);
		}
	}
}

@Injectable()
export class ApResolverService {
	constructor(
		@Inject(DI.config)
		protected readonly config: Config,

		@Inject(DI.meta)
		protected readonly meta: MiMeta,

		@Inject(DI.usersRepository)
		protected readonly usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		protected readonly notesRepository: NotesRepository,

		@Inject(DI.pollsRepository)
		protected readonly pollsRepository: PollsRepository,

		@Inject(DI.noteReactionsRepository)
		protected readonly noteReactionsRepository: NoteReactionsRepository,

		@Inject(DI.followRequestsRepository)
		protected readonly followRequestsRepository: FollowRequestsRepository,

		protected readonly utilityService: UtilityService,
		protected readonly systemAccountService: SystemAccountService,
		protected readonly apRequestService: ApRequestService,
		protected readonly httpRequestService: HttpRequestService,
		protected readonly apRendererService: ApRendererService,
		protected readonly apDbResolverService: ApDbResolverService,
		protected readonly loggerService: LoggerService,
		protected readonly apLogService: ApLogService,
		protected readonly apUtilityService: ApUtilityService,
		protected readonly cacheService: CacheService,
	) {
	}

	@bindThis
	public createResolver(opts?: {
		// Override the recursion limit
		recursionLimit?: number,
	}): Resolver {
		return new Resolver(
			this.config,
			this.meta,
			this.usersRepository,
			this.notesRepository,
			this.pollsRepository,
			this.noteReactionsRepository,
			this.followRequestsRepository,
			this.utilityService,
			this.systemAccountService,
			this.apRequestService,
			this.httpRequestService,
			this.apRendererService,
			this.apDbResolverService,
			this.loggerService,
			this.apLogService,
			this.apUtilityService,
			this.cacheService,
			opts?.recursionLimit,
		);
	}
}
