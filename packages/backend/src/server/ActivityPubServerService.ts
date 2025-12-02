/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as crypto from 'node:crypto';
import { IncomingMessage } from 'node:http';
import { format as formatURL } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import fastifyAccepts from '@fastify/accepts';
import httpSignature from '@peertube/http-signature';
import { Brackets, In, IsNull, LessThan, Not } from 'typeorm';
import accepts from 'accepts';
import vary from 'vary';
import secureJson from 'secure-json-parse';
import { DI } from '@/di-symbols.js';
import type { FollowingsRepository, NotesRepository, EmojisRepository, NoteReactionsRepository, UserProfilesRepository, UserNotePiningsRepository, UsersRepository, FollowRequestsRepository, MiMeta, MiUserNotePining } from '@/models/_.js';
import * as url from '@/misc/prelude/url.js';
import type { Config } from '@/config.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import { QueueService } from '@/core/QueueService.js';
import type { MiLocalUser, MiRemoteUser, MiUser } from '@/models/User.js';
import { isLocalUser } from '@/models/User.js';
import { UserKeypairService } from '@/core/UserKeypairService.js';
import type { MiUserPublickey } from '@/models/UserPublickey.js';
import type { MiFollowing } from '@/models/Following.js';
import { countIf } from '@/misc/prelude/array.js';
import type { MiNote } from '@/models/Note.js';
import { QueryService } from '@/core/QueryService.js';
import { UtilityService } from '@/core/UtilityService.js';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';
import { bindThis } from '@/decorators.js';
import { IActivity, IAnnounce, ICreate } from '@/core/activitypub/type.js';
import { isPureRenote, isQuote, isRenote } from '@/misc/is-renote.js';
import * as Acct from '@/misc/acct.js';
import { CacheService } from '@/core/CacheService.js';
import { CustomEmojiService, encodeEmojiKey } from '@/core/CustomEmojiService.js';
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginOptions, FastifyBodyParser } from 'fastify';
import type { FindOptionsWhere } from 'typeorm';
import { FanoutTimelineEndpointService } from '@/core/FanoutTimelineEndpointService.js';
import { promiseMap } from '@/misc/promise-map.js';

const ACTIVITY_JSON = 'application/activity+json; charset=utf-8';
const LD_JSON = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"; charset=utf-8';

@Injectable()
export class ActivityPubServerService {
	private logger: Logger;
	private authlogger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.noteReactionsRepository)
		private noteReactionsRepository: NoteReactionsRepository,

		@Inject(DI.emojisRepository)
		private emojisRepository: EmojisRepository,

		@Inject(DI.userNotePiningsRepository)
		private userNotePiningsRepository: UserNotePiningsRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.followRequestsRepository)
		private followRequestsRepository: FollowRequestsRepository,

		private utilityService: UtilityService,
		private apRendererService: ApRendererService,
		private apDbResolverService: ApDbResolverService,
		private queueService: QueueService,
		private userKeypairService: UserKeypairService,
		private queryService: QueryService,
		private fanoutTimelineEndpointService: FanoutTimelineEndpointService,
		private loggerService: LoggerService,
		private readonly cacheService: CacheService,
		private readonly customEmojiService: CustomEmojiService,
	) {
		//this.createServer = this.createServer.bind(this);
		this.logger = this.loggerService.getLogger('apserv', 'pink');
		this.authlogger = this.logger.createSubLogger('sigcheck');
	}

	@bindThis
	private setResponseType(request: FastifyRequest, reply: FastifyReply): void {
		const accept = request.accepts().type([ACTIVITY_JSON, LD_JSON]);
		if (accept === LD_JSON) {
			reply.type(LD_JSON);
		} else {
			reply.type(ACTIVITY_JSON);
		}
	}

	/**
	 * Pack Create<Note> or Announce Activity
	 * @param note Note
	 * @param author Author of the note
	 */
	@bindThis
	private async packActivity(note: MiNote, author: MiUser): Promise<ICreate | IAnnounce> {
		if (isRenote(note) && !isQuote(note)) {
			const renote = await this.notesRepository.findOneByOrFail({ id: note.renoteId });
			return this.apRendererService.renderAnnounce(renote.uri ? renote.uri : `${this.config.url}/notes/${renote.id}`, note);
		}

		return this.apRendererService.renderCreate(await this.apRendererService.renderNote(note, author, false), note);
	}

	/**
	 * Checks Authorized Fetch.
	 * Returns an object with two properties:
	 * * reject - true if the request should be ignored by the caller, false if it should be processed.
	 * * redact - true if the caller should redact response data, false if it should return full data.
	 * When "reject" is true, the HTTP status code will be automatically set to 401 unauthorized.
	 */
	private async checkAuthorizedFetch(
		request: FastifyRequest,
		reply: FastifyReply,
		userId?: string,
		essential?: boolean,
	): Promise<{ reject: boolean, redact: boolean }> {
		// Federation disabled => reject
		if (this.meta.federation === 'none') {
			reply.code(401);
			return { reject: true, redact: true };
		}

		// Auth fetch disabled => accept
		const allowUnsignedFetch = await this.getUnsignedFetchAllowance(userId);
		if (allowUnsignedFetch === 'always') {
			return { reject: false, redact: false };
		}

		// Valid signature => accept
		const error = await this.checkSignature(request);
		if (!error) {
			return { reject: false, redact: false };
		}

		// Unsigned, but essential => accept redacted
		if (allowUnsignedFetch === 'essential' && essential) {
			return { reject: false, redact: true };
		}

		// Unsigned, not essential => reject
		this.authlogger.warn(error);
		reply.code(401);
		return { reject: true, redact: true };
	}

	/**
	 * Verifies HTTP Signatures for a request.
	 * Returns null of success (valid signature).
	 * Returns a string error on validation failure.
	 */
	@bindThis
	private async checkSignature(request: FastifyRequest): Promise<string | null> {
		/* this code is inspired from the `inbox` function below, and
			 `queue/processors/InboxProcessorService`

			 those pieces of code also check `digest`, and various bits from the
			 request body, but that only makes sense for requests with a body:
			 here we're validating GET requests

			 this is also inspired by FireFish's `checkFetch`
		*/

		let signature: httpSignature.IParsedSignature;

		try {
			signature = httpSignature.parseRequest(request.raw, {
				headers: ['(request-target)', 'host', 'date'],
				authorizationHeaderName: 'signature',
			});
		} catch (e) {
			// not signed, or malformed signature: refuse
			return `${request.id} ${request.url} not signed, or malformed signature: refuse`;
		}

		const keyId = new URL(signature.keyId);
		const keyHost = this.utilityService.toPuny(keyId.hostname);

		const logPrefix = `${request.id} ${request.url} (by ${request.headers['user-agent']}) claims to be from ${keyHost}:`;

		if (signature.params.headers.indexOf('host') === -1 || request.headers.host !== this.config.host) {
			// no destination host, or not us: refuse
			return `${logPrefix} no destination host, or not us: refuse`;
		}

		if (!this.utilityService.isFederationAllowedHost(keyHost)) {
			/* blocked instance: refuse (we don't care if the signature is
				 good, if they even pretend to be from a blocked instance,
				 they're out) */
			return `${logPrefix} instance is blocked: refuse`;
		}

		// do we know the signer already?
		let authUser: {
			user: MiRemoteUser;
			key: MiUserPublickey | null;
		} | null = await this.apDbResolverService.getAuthUserFromKeyId(signature.keyId);

		if (authUser == null) {
			/* keyId is often in the shape `${user.uri}#${keyname}`, try
				 fetching information about the remote user */
			const candidate = formatURL(keyId, { fragment: false });
			this.authlogger.info(`${logPrefix} we don't know the user for keyId ${keyId}, trying to fetch via ${candidate}`);
			authUser = await this.apDbResolverService.getAuthUserFromApId(candidate);
		}

		if (authUser?.key == null) {
			// we can't figure out who the signer is, or we can't get their key: refuse
			return `${logPrefix} we can't figure out who the signer is, or we can't get their key: refuse`;
		}

		if (authUser.user.isSuspended) {
			// Signer is suspended locally
			return `${logPrefix} signer is suspended: refuse`;
		}

		// some fedi implementations include the query (`?foo=bar`) in the
		// signature, some don't, so we have to handle both cases
		function verifyWithOrWithoutQuery() {
			const httpSignatureValidated = httpSignature.verifySignature(signature, authUser!.key!.keyPem);
			if (httpSignatureValidated) return true;

			const requestUrl = new URL(`http://whatever${request.raw.url}`);
			if (! requestUrl.search) return false;

			// verification failed, the request URL contained a query, let's try without
			const semiRawRequest = request.raw;
			semiRawRequest.url = requestUrl.pathname;

			// no need for try/catch, if the original request parsed, this
			// one will, too
			const signatureWithoutQuery = httpSignature.parseRequest(semiRawRequest, {
				headers: ['(request-target)', 'host', 'date'],
				authorizationHeaderName: 'signature',
			});

			return httpSignature.verifySignature(signatureWithoutQuery, authUser!.key!.keyPem);
		}

		let httpSignatureValidated = verifyWithOrWithoutQuery();

		// maybe they changed their key? refetch it
		// TODO rate-limit this using lastFetchedAt
		if (!httpSignatureValidated) {
			authUser.key = await this.apDbResolverService.refetchPublicKeyForApId(authUser.user);
			if (authUser.key != null) {
				httpSignatureValidated = verifyWithOrWithoutQuery();
			}
		}

		if (!httpSignatureValidated) {
			// bad signature: refuse
			return `${logPrefix} failed to validate signature: refuse`;
		}

		// all good, don't refuse
		return null;
	}

	@bindThis
	private inbox(request: FastifyRequest, reply: FastifyReply) {
		if (this.meta.federation === 'none') {
			reply.code(403);
			return;
		}

		let signature;

		try {
			signature = httpSignature.parseRequest(request.raw, { 'headers': ['(request-target)', 'host', 'date'], authorizationHeaderName: 'signature' });
		} catch (e) {
			reply.code(401);
			return;
		}

		if (signature.params.headers.indexOf('host') === -1
			|| request.headers.host !== this.config.host) {
			// Host not specified or not match.
			reply.code(401);
			return;
		}

		if (signature.params.headers.indexOf('digest') === -1) {
			// Digest not found.
			reply.code(401);
		} else {
			const digest = request.headers.digest;

			if (typeof digest !== 'string') {
				// Huh?
				reply.code(401);
				return;
			}

			const re = /^([a-zA-Z0-9\-]+)=(.+)$/;
			const match = digest.match(re);

			if (match == null) {
				// Invalid digest
				reply.code(401);
				return;
			}

			const algo = match[1].toUpperCase();
			const digestValue = match[2];

			if (algo !== 'SHA-256') {
				// Unsupported digest algorithm
				reply.code(401);
				return;
			}

			if (request.rawBody == null) {
				// Bad request
				reply.code(400);
				return;
			}

			const hash = crypto.createHash('sha256').update(request.rawBody).digest('base64');

			if (hash !== digestValue) {
				// Invalid digest
				reply.code(401);
				return;
			}
		}

		this.queueService.inbox(request.body as IActivity, signature);

		reply.code(202);
	}

	@bindThis
	private async followers(
		request: FastifyRequest<{ Params: { user: string; }; Querystring: { cursor?: string; page?: string; }; }>,
		reply: FastifyReply,
	) {
		if (this.meta.federation === 'none') {
			reply.code(403);
			return;
		}

		const { reject } = await this.checkAuthorizedFetch(request, reply, request.params.user);
		if (reject) return;

		const userId = request.params.user;

		const cursor = request.query.cursor;
		if (cursor != null && typeof cursor !== 'string') {
			reply.code(400);
			return;
		}

		const page = request.query.page === 'true';

		const user = await this.usersRepository.findOneBy({
			id: userId,
			host: IsNull(),
		});

		if (user == null) {
			reply.code(404);
			return;
		}

		//#region Check ff visibility
		const profile = await this.userProfilesRepository.findOneByOrFail({ userId: user.id });

		if (profile.followersVisibility === 'private') {
			reply.code(403);
			return;
		} else if (profile.followersVisibility === 'followers') {
			reply.code(403);
			return;
		}
		//#endregion

		const limit = 10;
		const partOf = `${this.config.url}/users/${userId}/followers`;

		if (page) {
			const query = {
				followeeId: user.id,
			} as FindOptionsWhere<MiFollowing>;

			// カーソルが指定されている場合
			if (cursor) {
				query.id = LessThan(cursor);
			}

			// Get followers
			const followings = await this.followingsRepository.find({
				where: query,
				take: limit + 1,
				order: { id: -1 },
			});

			// 「次のページ」があるかどうか
			const inStock = followings.length === limit + 1;
			if (inStock) followings.pop();

			const renderedFollowers = await promiseMap(followings, async following => this.apRendererService.renderFollowUser(following.followerId), { limit: 4 });
			const rendered = this.apRendererService.renderOrderedCollectionPage(
				`${partOf}?${url.query({
					page: 'true',
					cursor,
				})}`,
				user.followersCount, renderedFollowers, partOf,
				undefined,
				inStock ? `${partOf}?${url.query({
					page: 'true',
					cursor: followings.at(-1)!.id,
				})}` : undefined,
			);

			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(rendered));
		} else {
			// index page
			const rendered = this.apRendererService.renderOrderedCollection(
				partOf,
				user.followersCount,
				`${partOf}?page=true`,
			);
			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(rendered));
		}
	}

	@bindThis
	private async following(
		request: FastifyRequest<{ Params: { user: string; }; Querystring: { cursor?: string; page?: string; }; }>,
		reply: FastifyReply,
	) {
		if (this.meta.federation === 'none') {
			reply.code(403);
			return;
		}

		const { reject } = await this.checkAuthorizedFetch(request, reply, request.params.user);
		if (reject) return;

		const userId = request.params.user;

		const cursor = request.query.cursor;
		if (cursor != null && typeof cursor !== 'string') {
			reply.code(400);
			return;
		}

		const page = request.query.page === 'true';

		const user = await this.usersRepository.findOneBy({
			id: userId,
			host: IsNull(),
		});

		if (user == null) {
			reply.code(404);
			return;
		}

		//#region Check ff visibility
		const profile = await this.userProfilesRepository.findOneByOrFail({ userId: user.id });

		if (profile.followingVisibility === 'private') {
			reply.code(403);
			return;
		} else if (profile.followingVisibility === 'followers') {
			reply.code(403);
			return;
		}
		//#endregion

		const limit = 10;
		const partOf = `${this.config.url}/users/${userId}/following`;

		if (page) {
			const query = {
				followerId: user.id,
			} as FindOptionsWhere<MiFollowing>;

			// カーソルが指定されている場合
			if (cursor) {
				query.id = LessThan(cursor);
			}

			// Get followings
			const followings = await this.followingsRepository.find({
				where: query,
				take: limit + 1,
				order: { id: -1 },
			});

			// 「次のページ」があるかどうか
			const inStock = followings.length === limit + 1;
			if (inStock) followings.pop();

			const renderedFollowees = await promiseMap(followings, async following => this.apRendererService.renderFollowUser(following.followeeId), { limit: 4 });
			const rendered = this.apRendererService.renderOrderedCollectionPage(
				`${partOf}?${url.query({
					page: 'true',
					cursor,
				})}`,
				user.followingCount, renderedFollowees, partOf,
				undefined,
				inStock ? `${partOf}?${url.query({
					page: 'true',
					cursor: followings.at(-1)!.id,
				})}` : undefined,
			);

			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(rendered));
		} else {
			// index page
			const rendered = this.apRendererService.renderOrderedCollection(
				partOf,
				user.followingCount,
				`${partOf}?page=true`,
			);
			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(rendered));
		}
	}

	@bindThis
	private async featured(request: FastifyRequest<{ Params: { user: string; }; }>, reply: FastifyReply) {
		if (this.meta.federation === 'none') {
			reply.code(403);
			return;
		}

		const { reject } = await this.checkAuthorizedFetch(request, reply, request.params.user);
		if (reject) return;

		const userId = request.params.user;

		const user = await this.cacheService.findLocalUserById(userId);

		if (user == null) {
			reply.code(404);
			return;
		}

		const pinings = await this.userNotePiningsRepository.find({
			where: { userId: user.id },
			order: { id: 'DESC' },
			relations: { note: true },
		}) as (MiUserNotePining & { note: MiNote })[];

		const pinnedNotes = pinings
			.map(pin => pin.note)
			.filter(note => !note.localOnly && ['public', 'home'].includes(note.visibility) && !isPureRenote(note));

		const renderedNotes = await promiseMap(pinnedNotes, async note => await this.apRendererService.renderNote(note, user), { limit: 4 });

		const rendered = this.apRendererService.renderOrderedCollection(
			`${this.config.url}/users/${userId}/collections/featured`,
			renderedNotes.length,
			undefined,
			undefined,
			renderedNotes,
		);

		this.setResponseType(request, reply);
		return (this.apRendererService.addContext(rendered));
	}

	@bindThis
	private async outbox(
		request: FastifyRequest<{
			Params: { user: string; };
			Querystring: { since_id?: string; until_id?: string; page?: string; };
		}>,
		reply: FastifyReply,
	) {
		if (this.meta.federation === 'none') {
			reply.code(403);
			return;
		}

		const { reject } = await this.checkAuthorizedFetch(request, reply, request.params.user);
		if (reject) return;

		const userId = request.params.user;

		const sinceId = request.query.since_id;
		if (sinceId != null && typeof sinceId !== 'string') {
			reply.code(400);
			return;
		}

		const untilId = request.query.until_id;
		if (untilId != null && typeof untilId !== 'string') {
			reply.code(400);
			return;
		}

		const page = request.query.page === 'true';

		if (countIf(x => x != null, [sinceId, untilId]) > 1) {
			reply.code(400);
			return;
		}

		const user = await this.usersRepository.findOneBy({
			id: userId,
			host: IsNull(),
		});

		if (user == null) {
			reply.code(404);
			return;
		}

		const limit = 20;
		const partOf = `${this.config.url}/users/${userId}/outbox`;

		if (page) {
			const notes = this.meta.enableFanoutTimeline ? await this.fanoutTimelineEndpointService.getMiNotes({
				sinceId: sinceId ?? null,
				untilId: untilId ?? null,
				limit: limit,
				allowPartial: false, // Possibly true? IDK it's OK for ordered collection.
				me: null,
				redisTimelines: [
					`userTimeline:${user.id}`,
					`userTimelineWithReplies:${user.id}`,
				],
				useDbFallback: true,
				ignoreAuthorFromMute: true,
				excludePureRenotes: false,
				noteFilter: (note) => {
					if (note.visibility !== 'home' && note.visibility !== 'public') return false;
					if (note.localOnly) return false;
					return true;
				},
				dbFallback: async (untilId, sinceId, limit) => {
					return await this.getUserNotesFromDb(sinceId, untilId, limit, user.id);
				},
			}) : await this.getUserNotesFromDb(sinceId ?? null, untilId ?? null, limit, user.id);

			if (sinceId) notes.reverse();

			const activities = await promiseMap(notes, async note => await this.packActivity(note, user));
			const rendered = this.apRendererService.renderOrderedCollectionPage(
				`${partOf}?${url.query({
					page: 'true',
					since_id: sinceId,
					until_id: untilId,
				})}`,
				user.notesCount, activities, partOf,
				notes.length ? `${partOf}?${url.query({
					page: 'true',
					since_id: notes[0].id,
				})}` : undefined,
				notes.length ? `${partOf}?${url.query({
					page: 'true',
					until_id: notes.at(-1)!.id,
				})}` : undefined,
			);

			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(rendered));
		} else {
			// index page
			const rendered = this.apRendererService.renderOrderedCollection(
				partOf,
				user.notesCount,
				`${partOf}?page=true`,
				`${partOf}?page=true&since_id=000000000000000000000000`,
			);
			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(rendered));
		}
	}

	@bindThis
	private async getUserNotesFromDb(untilId: string | null, sinceId: string | null, limit: number, userId: MiUser['id']) {
		return await this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), sinceId, untilId)
			.andWhere('note.userId = :userId', { userId })
			.andWhere(new Brackets(qb => {
				qb
					.where('note.visibility = \'public\'')
					.orWhere('note.visibility = \'home\'');
			}))
			.andWhere('note.localOnly = FALSE')
			.limit(limit)
			.getMany();
	}

	@bindThis
	private async userInfo(request: FastifyRequest, reply: FastifyReply, user: MiUser | null, redact = false) {
		if (this.meta.federation === 'none') {
			reply.code(403);
			return;
		}

		if (user == null) {
			reply.code(404);
			return;
		}

		// リモートだったらリダイレクト
		if (user.host != null) {
			if (user.uri == null || this.utilityService.isSelfHost(user.host)) {
				reply.code(500);
				return;
			}
			reply.redirect(user.uri, 301);
			return;
		}

		this.setResponseType(request, reply);

		const person = redact
			? await this.apRendererService.renderPersonRedacted(user as MiLocalUser)
			: await this.apRendererService.renderPerson(user as MiLocalUser);
		return this.apRendererService.addContext(person);
	}

	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.addConstraintStrategy({
			name: 'apOrHtml',
			storage() {
				const store = {} as any;
				return {
					get(key: string) {
						return store[key] ?? null;
					},
					set(key: string, value: any) {
						store[key] = value;
					},
				};
			},
			deriveConstraint(request: IncomingMessage) {
				const accepted = accepts(request).type(['html', ACTIVITY_JSON, LD_JSON]);
				if (accepted === false) return null;
				return accepted !== 'html' ? 'ap' : 'html';
			},
		});

		const almostDefaultJsonParser: FastifyBodyParser<Buffer> = function (request, rawBody, done) {
			if (rawBody.length === 0) {
				const err = new Error('Body cannot be empty!') as any;
				err.statusCode = 400;
				return done(err);
			}

			try {
				const json = secureJson.parse(rawBody.toString('utf8'), null, {
					protoAction: 'ignore',
					constructorAction: 'ignore',
				});
				done(null, json);
			} catch (err: any) {
				err.statusCode = 400;
				return done(err);
			}
		};

		fastify.register(fastifyAccepts);
		fastify.addContentTypeParser('application/activity+json', { parseAs: 'buffer' }, almostDefaultJsonParser);
		fastify.addContentTypeParser('application/ld+json', { parseAs: 'buffer' }, almostDefaultJsonParser);

		fastify.addHook('onRequest', (request, reply, done) => {
			reply.header('Access-Control-Allow-Headers', 'Accept');
			reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
			reply.header('Access-Control-Allow-Origin', '*');
			reply.header('Access-Control-Expose-Headers', 'Vary');

			// Tell crawlers not to index AP endpoints.
			// https://developers.google.com/search/docs/crawling-indexing/block-indexing
			reply.header('X-Robots-Tag', 'noindex');

			/* tell any caching proxy that they should not cache these
				 responses: we wouldn't want the proxy to return a 403 to
				 someone presenting a valid signature, or return a cached
				 response body to someone we've blocked!
			 */
			reply.header('Cache-Control', 'private, max-age=0, must-revalidate');
			done();
		});

		//#region Routing
		// inbox (limit: 64kb)
		fastify.post('/inbox', { config: { rawBody: true }, bodyLimit: 1024 * 64 }, async (request, reply) => await this.inbox(request, reply));
		fastify.post('/users/:user/inbox', { config: { rawBody: true }, bodyLimit: 1024 * 64 }, async (request, reply) => await this.inbox(request, reply));

		// note
		fastify.get<{ Params: { note: string; } }>('/notes/:note', { constraints: { apOrHtml: 'ap' } }, async (request, reply) => {
			vary(reply.raw, 'Accept');

			if (this.meta.federation === 'none') {
				reply.code(403);
				return;
			}

			const note = await this.notesRepository.findOneBy({
				id: request.params.note,
				visibility: In(['public', 'home']),
				localOnly: false,
			});

			const { reject } = await this.checkAuthorizedFetch(request, reply, note?.userId);
			if (reject) return;

			if (note == null) {
				reply.code(404);
				return;
			}

			// リモートだったらリダイレクト
			if (note.userHost != null) {
				if (note.uri == null || this.utilityService.isSelfHost(note.userHost)) {
					reply.code(500);
					return;
				}
				reply.redirect(note.uri);
				return;
			}

			// Boosts don't federate directly - they should only be referenced as an activity
			if (isPureRenote(note)) {
				return 404;
			}

			this.setResponseType(request, reply);

			const author = await this.usersRepository.findOneByOrFail({ id: note.userId });
			return this.apRendererService.addContext(await this.apRendererService.renderNote(note, author, false));
		});

		// note activity
		fastify.get<{ Params: { note: string; } }>('/notes/:note/activity', async (request, reply) => {
			vary(reply.raw, 'Accept');

			if (this.meta.federation === 'none') {
				reply.code(403);
				return;
			}

			const note = await this.notesRepository.findOneBy({
				id: request.params.note,
				userHost: IsNull(),
				visibility: In(['public', 'home']),
				localOnly: false,
			});

			const { reject } = await this.checkAuthorizedFetch(request, reply, note?.userId);
			if (reject) return;

			if (note == null) {
				reply.code(404);
				return;
			}

			this.setResponseType(request, reply);

			const author = await this.usersRepository.findOneByOrFail({ id: note.userId });
			return (this.apRendererService.addContext(await this.packActivity(note, author)));
		});

		// replies
		fastify.get<{
			Params: { note: string; };
			Querystring: { page?: unknown; until_id?: unknown; };
		}>('/notes/:note/replies', async (request, reply) => {
			vary(reply.raw, 'Accept');
			this.setResponseType(request, reply);

			// Raw query to avoid fetching the while entity just to check access and get the user ID
			const note = await this.notesRepository
				.createQueryBuilder('note')
				.andWhere({
					id: request.params.note,
					userHost: IsNull(),
					visibility: In(['public', 'home']),
					localOnly: false,
				})
				.select(['note.id', 'note.userId'])
				.getRawOne<{ note_id: string, note_userId: string }>();

			const { reject } = await this.checkAuthorizedFetch(request, reply, note?.note_userId);
			if (reject) return;

			if (note == null) {
				reply.code(404);
				return;
			}

			const untilId = request.query.until_id;
			if (untilId != null && typeof(untilId) !== 'string') {
				reply.code(400);
				return;
			}

			// If page is unset, then we just provide the outer wrapper.
			// This is because the spec doesn't allow the wrapper to contain both elements *and* pages.
			// We could technically do it anyway, but that may break other instances.
			if (request.query.page !== 'true') {
				const collection = await this.apRendererService.renderRepliesCollection(note.note_id);
				return this.apRendererService.addContext(collection);
			}

			const page = await this.apRendererService.renderRepliesCollectionPage(note.note_id, untilId ?? undefined);
			return this.apRendererService.addContext(page);
		});

		// outbox
		fastify.get<{
			Params: { user: string; };
			Querystring: { since_id?: string; until_id?: string; page?: string; };
		}>('/users/:user/outbox', async (request, reply) => await this.outbox(request, reply));

		// followers
		fastify.get<{
			Params: { user: string; };
			Querystring: { cursor?: string; page?: string; };
		}>('/users/:user/followers', async (request, reply) => await this.followers(request, reply));

		// following
		fastify.get<{
			Params: { user: string; };
			Querystring: { cursor?: string; page?: string; };
		}>('/users/:user/following', async (request, reply) => await this.following(request, reply));

		// featured
		fastify.get<{ Params: { user: string; }; }>('/users/:user/collections/featured', async (request, reply) => await this.featured(request, reply));

		// publickey
		fastify.get<{ Params: { user: string; } }>('/users/:user/publickey', async (request, reply) => {
			if (this.meta.federation === 'none') {
				reply.code(403);
				return;
			}

			const { reject } = await this.checkAuthorizedFetch(request, reply, request.params.user, true);
			if (reject) return;

			const userId = request.params.user;

			const user = await this.usersRepository.findOneBy({
				id: userId,
				host: IsNull(),
			});

			if (user == null) {
				reply.code(404);
				return;
			}

			const keypair = await this.userKeypairService.getUserKeypair(user.id);

			if (isLocalUser(user)) {
				this.setResponseType(request, reply);
				return (this.apRendererService.addContext(this.apRendererService.renderKey(user, keypair)));
			} else {
				reply.code(400);
				return;
			}
		});

		fastify.get<{ Params: { user: string; } }>('/users/:user', { constraints: { apOrHtml: 'ap' } }, async (request, reply) => {
			const { reject, redact } = await this.checkAuthorizedFetch(request, reply, request.params.user, true);
			if (reject) return;

			vary(reply.raw, 'Accept');

			if (this.meta.federation === 'none') {
				reply.code(403);
				return;
			}

			const userId = request.params.user;

			const user = await this.usersRepository.findOneBy({
				id: userId,
				isSuspended: false,
			});

			return await this.userInfo(request, reply, user, redact);
		});

		fastify.get<{ Params: { acct: string; } }>('/@:acct', { constraints: { apOrHtml: 'ap' } }, async (request, reply) => {
			vary(reply.raw, 'Accept');

			if (this.meta.federation === 'none') {
				reply.code(403);
				return;
			}

			const acct = Acct.parse(request.params.acct);

			const user = await this.usersRepository.findOneBy({
				usernameLower: acct.username.toLowerCase(),
				host: acct.host ?? IsNull(),
				isSuspended: false,
			});

			const { reject, redact } = await this.checkAuthorizedFetch(request, reply, user?.id, true);
			if (reject) return;

			return await this.userInfo(request, reply, user, redact);
		});
		//#endregion

		// emoji
		fastify.get<{ Params: { emoji: string; } }>('/emojis/:emoji', async (request, reply) => {
			if (this.meta.federation === 'none') {
				reply.code(403);
				return;
			}

			const { reject } = await this.checkAuthorizedFetch(request, reply);
			if (reject) return;

			const emojiKey = encodeEmojiKey({ name: request.params.emoji, host: null });
			const emoji = await this.customEmojiService.emojisByKeyCache.fetchMaybe(emojiKey);

			if (emoji == null || emoji.localOnly) {
				reply.code(404);
				return;
			}

			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(this.apRendererService.renderEmoji(emoji)));
		});

		// like
		fastify.get<{ Params: { like: string; } }>('/likes/:like', async (request, reply) => {
			if (this.meta.federation === 'none') {
				reply.code(403);
				return;
			}

			const reaction = await this.noteReactionsRepository.findOneBy({ id: request.params.like });

			const { reject } = await this.checkAuthorizedFetch(request, reply, reaction?.userId);
			if (reject) return;

			if (reaction == null) {
				reply.code(404);
				return;
			}

			const note = await this.notesRepository.findOneBy({ id: reaction.noteId });

			if (note == null) {
				reply.code(404);
				return;
			}

			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(await this.apRendererService.renderLike(reaction, note)));
		});

		// follow
		fastify.get<{ Params: { follower: string; followee: string; } }>('/follows/:follower/:followee', async (request, reply) => {
			if (this.meta.federation === 'none') {
				reply.code(403);
				return;
			}

			const { reject } = await this.checkAuthorizedFetch(request, reply, request.params.follower);
			if (reject) return;

			// This may be used before the follow is completed, so we do not
			// check if the following exists.

			const [follower, followee] = await Promise.all([
				this.cacheService.findLocalUserById(request.params.follower),
				this.cacheService.findRemoteUserById(request.params.followee),
			]) as [MiLocalUser | MiRemoteUser | null, MiLocalUser | MiRemoteUser | null];

			if (follower == null || followee == null) {
				reply.code(404);
				return;
			}

			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(this.apRendererService.renderFollow(follower, followee)));
		});

		// follow
		fastify.get<{ Params: { followRequestId: string; } }>('/follows/:followRequestId', async (request, reply) => {
			if (this.meta.federation === 'none') {
				reply.code(403);
				return;
			}

			// This may be used before the follow is completed, so we do not
			// check if the following exists and only check if the follow request exists.

			const followRequest = await this.followRequestsRepository.findOneBy({
				id: request.params.followRequestId,
			});

			const { reject } = await this.checkAuthorizedFetch(request, reply, followRequest?.followerId);
			if (reject) return;

			if (followRequest == null) {
				reply.code(404);
				return;
			}

			const [follower, followee] = await Promise.all([
				this.cacheService.findLocalUserById(followRequest.followerId),
				this.cacheService.findRemoteUserById(followRequest.followeeId),
			]) as [MiLocalUser | MiRemoteUser | null, MiLocalUser | MiRemoteUser | null];

			if (follower == null || followee == null) {
				reply.code(404);
				return;
			}

			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(this.apRendererService.renderFollow(follower, followee)));
		});

		done();
	}

	private async getUnsignedFetchAllowance(userId: string | undefined) {
		const user = userId ? await this.cacheService.findLocalUserById(userId) : null;

		// User system value if there is no user, or if user has deferred the choice.
		if (!user?.allowUnsignedFetch || user.allowUnsignedFetch === 'staff') {
			return this.meta.allowUnsignedFetch;
		}

		return user.allowUnsignedFetch;
	}
}
