/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
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
import type { FollowingsRepository, NotesRepository, EmojisRepository, NoteReactionsRepository, UserProfilesRepository, UserNotePiningsRepository, UsersRepository, FollowRequestsRepository } from '@/models/_.js';
import * as url from '@/misc/prelude/url.js';
import type { Config } from '@/config.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import { QueueService } from '@/core/QueueService.js';
import type { MiLocalUser, MiRemoteUser, MiUser } from '@/models/User.js';
import { MetaService } from '@/core/MetaService.js';
import { UserKeypairService } from '@/core/UserKeypairService.js';
import { InstanceActorService } from '@/core/InstanceActorService.js';
import type { MiUserPublickey } from '@/models/UserPublickey.js';
import type { MiFollowing } from '@/models/Following.js';
import { countIf } from '@/misc/prelude/array.js';
import type { MiNote } from '@/models/Note.js';
import { QueryService } from '@/core/QueryService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { bindThis } from '@/decorators.js';
import { IActivity } from '@/core/activitypub/type.js';
import { isPureRenote } from '@/misc/is-pure-renote.js';
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginOptions, FastifyBodyParser } from 'fastify';
import type { FindOptionsWhere } from 'typeorm';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';
import { secureishCompare } from '@/misc/secure-ish-compare.js';

const ACTIVITY_JSON = 'application/activity+json; charset=utf-8';
const LD_JSON = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"; charset=utf-8';

@Injectable()
export class ActivityPubServerService {
	private logger: Logger;
	private authlogger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

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

		private metaService: MetaService,
		private utilityService: UtilityService,
		private userEntityService: UserEntityService,
		private instanceActorService: InstanceActorService,
		private apRendererService: ApRendererService,
		private apDbResolverService: ApDbResolverService,
		private queueService: QueueService,
		private userKeypairService: UserKeypairService,
		private queryService: QueryService,
		private loggerService: LoggerService,
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
	 */
	@bindThis
	private async packActivity(note: MiNote): Promise<any> {
		if (isPureRenote(note)) {
			const renote = await this.notesRepository.findOneByOrFail({ id: note.renoteId });
			return this.apRendererService.renderAnnounce(renote.uri ? renote.uri : `${this.config.url}/notes/${renote.id}`, note);
		}

		return this.apRendererService.renderCreate(await this.apRendererService.renderNote(note, false), note);
	}

	@bindThis
	private async shouldRefuseGetRequest(request: FastifyRequest, reply: FastifyReply, userId: string | undefined = undefined): Promise<boolean> {
		if (!this.config.checkActivityPubGetSignature) return false;

		/* this code is inspired from the `inbox` function below, and
			 `queue/processors/InboxProcessorService`

			 those pieces of code also check `digest`, and various bits from the
			 request body, but that only makes sense for requests with a body:
			 here we're validating GET requests

			 this is also inspired by FireFish's `checkFetch`
		*/

		/* tell any caching proxy that they should not cache these
		   responses: we wouldn't want the proxy to return a 403 to
		   someone presenting a valid signature, or return a cached
		   response body to someone we've blocked!
		 */
		reply.header('Cache-Control', 'private, max-age=0, must-revalidate');

		/* we always allow requests about our instance actor, because when
			 a remote instance needs to check our signature on a request we
			 sent, it will need to fetch information about the user that
			 signed it (which is our instance actor), and if we try to check
			 their signature on *that* request, we'll fetch *their* instance
			 actor... leading to an infinite recursion */
		if (userId) {
			const instanceActor = await this.instanceActorService.getInstanceActor();

			if (userId === instanceActor.id || userId === instanceActor.username) {
				this.authlogger.debug(`${request.id} ${request.url} request to instance.actor, letting through`);
				return false;
			}
		}

		let signature;

		try {
			signature = httpSignature.parseRequest(request.raw, { 'headers': [] });
		} catch (e) {
			// not signed, or malformed signature: refuse
			this.authlogger.warn(`${request.id} ${request.url} not signed, or malformed signature: refuse`);
			reply.code(401);
			return true;
		}

		const keyId = new URL(signature.keyId);
		const keyHost = this.utilityService.toPuny(keyId.hostname);

		const logPrefix = `${request.id} ${request.url} (by ${request.headers['user-agent']}) apparently from ${keyHost}:`;

		if (signature.params.headers.indexOf('host') === -1
			|| request.headers.host !== this.config.host) {
			// no destination host, or not us: refuse
			this.authlogger.warn(`${logPrefix} no destination host, or not us: refuse`);
			reply.code(401);
			return true;
		}

		const meta = await this.metaService.fetch();
		if (this.utilityService.isBlockedHost(meta.blockedHosts, keyHost)) {
			/* blocked instance: refuse (we don't care if the signature is
				 good, if they even pretend to be from a blocked instance,
				 they're out) */
			this.authlogger.warn(`${logPrefix} instance is blocked: refuse`);
			reply.code(401);
			return true;
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
			this.authlogger.warn(`${logPrefix} we can't figure out who the signer is, or we can't get their key: refuse`);
			reply.code(401);
			return true;
		}

		let httpSignatureValidated = httpSignature.verifySignature(signature, authUser.key.keyPem);

		if (!httpSignatureValidated) {
			this.authlogger.info(`${logPrefix} failed to validate signature, re-fetching the key for ${authUser.user.uri}`);
			// maybe they changed their key? refetch it
			authUser.key = await this.apDbResolverService.refetchPublicKeyForApId(authUser.user);

			if (authUser.key != null) {
				httpSignatureValidated = httpSignature.verifySignature(signature, authUser.key.keyPem);
			} else {
				this.authlogger.warn(`${logPrefix} failed to re-fetch key for ${authUser.user}`);
			}
		}

		if (!httpSignatureValidated) {
			// bad signature: refuse
			this.authlogger.info(`${logPrefix} failed to validate signature: refuse`);
			reply.code(401);
			return true;
		}

		// all good, don't refuse
		return false;
	}

	@bindThis
	private inbox(request: FastifyRequest, reply: FastifyReply) {
		let signature;

		try {
			signature = httpSignature.parseRequest(request.raw, { 'headers': [] });
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

			if (!secureishCompare(hash, digestValue)) {
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
		if (await this.shouldRefuseGetRequest(request, reply, request.params.user)) return;

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
			if (!this.config.checkActivityPubGetSignature) reply.header('Cache-Control', 'public, max-age=30');
			return;
		} else if (profile.followersVisibility === 'followers') {
			reply.code(403);
			if (!this.config.checkActivityPubGetSignature) reply.header('Cache-Control', 'public, max-age=30');
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

			const renderedFollowers = await Promise.all(followings.map(following => this.apRendererService.renderFollowUser(following.followerId)));
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
			if (!this.config.checkActivityPubGetSignature) reply.header('Cache-Control', 'public, max-age=180');
			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(rendered));
		}
	}

	@bindThis
	private async following(
		request: FastifyRequest<{ Params: { user: string; }; Querystring: { cursor?: string; page?: string; }; }>,
		reply: FastifyReply,
	) {
		if (await this.shouldRefuseGetRequest(request, reply, request.params.user)) return;

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
			if (!this.config.checkActivityPubGetSignature) reply.header('Cache-Control', 'public, max-age=30');
			return;
		} else if (profile.followingVisibility === 'followers') {
			reply.code(403);
			if (!this.config.checkActivityPubGetSignature) reply.header('Cache-Control', 'public, max-age=30');
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

			const renderedFollowees = await Promise.all(followings.map(following => this.apRendererService.renderFollowUser(following.followeeId)));
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
			if (!this.config.checkActivityPubGetSignature) reply.header('Cache-Control', 'public, max-age=180');
			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(rendered));
		}
	}

	@bindThis
	private async featured(request: FastifyRequest<{ Params: { user: string; }; }>, reply: FastifyReply) {
		if (await this.shouldRefuseGetRequest(request, reply, request.params.user)) return;

		const userId = request.params.user;

		const user = await this.usersRepository.findOneBy({
			id: userId,
			host: IsNull(),
		});

		if (user == null) {
			reply.code(404);
			return;
		}

		const pinings = await this.userNotePiningsRepository.find({
			where: { userId: user.id },
			order: { id: 'DESC' },
		});

		const pinnedNotes = (await Promise.all(pinings.map(pining =>
			this.notesRepository.findOneByOrFail({ id: pining.noteId }))))
			.filter(note => !note.localOnly && ['public', 'home'].includes(note.visibility));

		const renderedNotes = await Promise.all(pinnedNotes.map(note => this.apRendererService.renderNote(note)));

		const rendered = this.apRendererService.renderOrderedCollection(
			`${this.config.url}/users/${userId}/collections/featured`,
			renderedNotes.length,
			undefined,
			undefined,
			renderedNotes,
		);

		if (!this.config.checkActivityPubGetSignature) reply.header('Cache-Control', 'public, max-age=180');
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
		if (await this.shouldRefuseGetRequest(request, reply, request.params.user)) return;

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
			const query = this.queryService.makePaginationQuery(this.notesRepository.createQueryBuilder('note'), sinceId, untilId)
				.andWhere('note.userId = :userId', { userId: user.id })
				.andWhere(new Brackets(qb => {
					qb
						.where('note.visibility = \'public\'')
						.orWhere('note.visibility = \'home\'');
				}))
				.andWhere('note.localOnly = FALSE');

			const notes = await query.limit(limit).getMany();

			if (sinceId) notes.reverse();

			const activities = await Promise.all(notes.map(note => this.packActivity(note)));
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
			if (!this.config.checkActivityPubGetSignature) reply.header('Cache-Control', 'public, max-age=180');
			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(rendered));
		}
	}

	@bindThis
	private async userInfo(request: FastifyRequest, reply: FastifyReply, user: MiUser | null) {
		if (user == null) {
			reply.code(404);
			return;
		}

		if (!this.config.checkActivityPubGetSignature) reply.header('Cache-Control', 'public, max-age=180');
		this.setResponseType(request, reply);
		return (this.apRendererService.addContext(await this.apRendererService.renderPerson(user as MiLocalUser)));
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
				const isAp = typeof accepted === 'string' && !accepted.match(/html/);
				return isAp ? 'ap' : 'html';
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
			done();
		});

		//#region Routing
		// inbox (limit: 64kb)
		fastify.post('/inbox', { config: { rawBody: true }, bodyLimit: 1024 * 64 }, async (request, reply) => await this.inbox(request, reply));
		fastify.post('/users/:user/inbox', { config: { rawBody: true }, bodyLimit: 1024 * 64 }, async (request, reply) => await this.inbox(request, reply));

		// note
		fastify.get<{ Params: { note: string; } }>('/notes/:note', { constraints: { apOrHtml: 'ap' } }, async (request, reply) => {
			if (await this.shouldRefuseGetRequest(request, reply)) return;

			vary(reply.raw, 'Accept');

			const note = await this.notesRepository.findOneBy({
				id: request.params.note,
				visibility: In(['public', 'home']),
				localOnly: false,
			});

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

			if (!this.config.checkActivityPubGetSignature) reply.header('Cache-Control', 'public, max-age=180');
			this.setResponseType(request, reply);
			return this.apRendererService.addContext(await this.apRendererService.renderNote(note, false));
		});

		// note activity
		fastify.get<{ Params: { note: string; } }>('/notes/:note/activity', async (request, reply) => {
			if (await this.shouldRefuseGetRequest(request, reply)) return;

			vary(reply.raw, 'Accept');

			const note = await this.notesRepository.findOneBy({
				id: request.params.note,
				userHost: IsNull(),
				visibility: In(['public', 'home']),
				localOnly: false,
			});

			if (note == null) {
				reply.code(404);
				return;
			}

			if (!this.config.checkActivityPubGetSignature) reply.header('Cache-Control', 'public, max-age=180');
			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(await this.packActivity(note)));
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
			if (await this.shouldRefuseGetRequest(request, reply, request.params.user)) return;

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

			if (this.userEntityService.isLocalUser(user)) {
				if (!this.config.checkActivityPubGetSignature) reply.header('Cache-Control', 'public, max-age=180');
				this.setResponseType(request, reply);
				return (this.apRendererService.addContext(this.apRendererService.renderKey(user, keypair)));
			} else {
				reply.code(400);
				return;
			}
		});

		fastify.get<{ Params: { user: string; } }>('/users/:user', { constraints: { apOrHtml: 'ap' } }, async (request, reply) => {
			if (await this.shouldRefuseGetRequest(request, reply, request.params.user)) return;

			vary(reply.raw, 'Accept');

			const userId = request.params.user;

			const user = await this.usersRepository.findOneBy({
				id: userId,
				host: IsNull(),
				isSuspended: false,
			});

			return await this.userInfo(request, reply, user);
		});

		fastify.get<{ Params: { user: string; } }>('/@:user', { constraints: { apOrHtml: 'ap' } }, async (request, reply) => {
			if (await this.shouldRefuseGetRequest(request, reply, request.params.user)) return;

			vary(reply.raw, 'Accept');

			const user = await this.usersRepository.findOneBy({
				usernameLower: request.params.user.toLowerCase(),
				host: IsNull(),
				isSuspended: false,
			});

			return await this.userInfo(request, reply, user);
		});
		//#endregion

		// emoji
		fastify.get<{ Params: { emoji: string; } }>('/emojis/:emoji', async (request, reply) => {
			if (await this.shouldRefuseGetRequest(request, reply)) return;

			const emoji = await this.emojisRepository.findOneBy({
				host: IsNull(),
				name: request.params.emoji,
			});

			if (emoji == null || emoji.localOnly) {
				reply.code(404);
				return;
			}

			if (!this.config.checkActivityPubGetSignature) reply.header('Cache-Control', 'public, max-age=180');
			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(await this.apRendererService.renderEmoji(emoji)));
		});

		// like
		fastify.get<{ Params: { like: string; } }>('/likes/:like', async (request, reply) => {
			if (await this.shouldRefuseGetRequest(request, reply)) return;

			const reaction = await this.noteReactionsRepository.findOneBy({ id: request.params.like });

			if (reaction == null) {
				reply.code(404);
				return;
			}

			const note = await this.notesRepository.findOneBy({ id: reaction.noteId });

			if (note == null) {
				reply.code(404);
				return;
			}

			if (!this.config.checkActivityPubGetSignature) reply.header('Cache-Control', 'public, max-age=180');
			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(await this.apRendererService.renderLike(reaction, note)));
		});

		// follow
		fastify.get<{ Params: { follower: string; followee: string; } }>('/follows/:follower/:followee', async (request, reply) => {
			if (await this.shouldRefuseGetRequest(request, reply)) return;

			// This may be used before the follow is completed, so we do not
			// check if the following exists.

			const [follower, followee] = await Promise.all([
				this.usersRepository.findOneBy({
					id: request.params.follower,
					host: IsNull(),
				}),
				this.usersRepository.findOneBy({
					id: request.params.followee,
					host: Not(IsNull()),
				}),
			]) as [MiLocalUser | MiRemoteUser | null, MiLocalUser | MiRemoteUser | null];

			if (follower == null || followee == null) {
				reply.code(404);
				return;
			}

			if (!this.config.checkActivityPubGetSignature) reply.header('Cache-Control', 'public, max-age=180');
			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(this.apRendererService.renderFollow(follower, followee)));
		});

		// follow
		fastify.get<{ Params: { followRequestId: string ; } }>('/follows/:followRequestId', async (request, reply) => {
			if (await this.shouldRefuseGetRequest(request, reply)) return;

			// This may be used before the follow is completed, so we do not
			// check if the following exists and only check if the follow request exists.

			const followRequest = await this.followRequestsRepository.findOneBy({
				id: request.params.followRequestId,
			});

			if (followRequest == null) {
				reply.code(404);
				return;
			}

			const [follower, followee] = await Promise.all([
				this.usersRepository.findOneBy({
					id: followRequest.followerId,
					host: IsNull(),
				}),
				this.usersRepository.findOneBy({
					id: followRequest.followeeId,
					host: Not(IsNull()),
				}),
			]) as [MiLocalUser | MiRemoteUser | null, MiLocalUser | MiRemoteUser | null];

			if (follower == null || followee == null) {
				reply.code(404);
				return;
			}

			if (!this.config.checkActivityPubGetSignature) reply.header('Cache-Control', 'public, max-age=180');
			this.setResponseType(request, reply);
			return (this.apRendererService.addContext(this.apRendererService.renderFollow(follower, followee)));
		});

		done();
	}
}
