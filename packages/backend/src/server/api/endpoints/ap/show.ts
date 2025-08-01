/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { MiNote } from '@/models/Note.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { isActor, isPost, getApId } from '@/core/activitypub/type.js';
import type { SchemaType } from '@/misc/json-schema.js';
import { ApResolverService } from '@/core/activitypub/ApResolverService.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import { ApNoteService } from '@/core/activitypub/models/ApNoteService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import { ApRequestService } from '@/core/activitypub/ApRequestService.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import { ApiError } from '../../error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';

export const meta = {
	tags: ['federation'],

	requireCredential: true,
	kind: 'read:account',

	// Up to 30 calls, then 1 per 1/2 second
	limit: {
		type: 'bucket',
		size: 30,
		dripRate: 500,
	},

	errors: {
		federationNotAllowed: {
			message: 'Federation for this host is not allowed.',
			code: 'FEDERATION_NOT_ALLOWED',
			id: '974b799e-1a29-4889-b706-18d4dd93e266',
		},
		uriInvalid: {
			message: 'URI is invalid.',
			code: 'URI_INVALID',
			id: '1a5eab56-e47b-48c2-8d5e-217b897d70db',
		},
		requestFailed: {
			message: 'Request failed.',
			code: 'REQUEST_FAILED',
			id: '81b539cf-4f57-4b29-bc98-032c33c0792e',
		},
		responseInvalid: {
			message: 'Response from remote server is invalid.',
			code: 'RESPONSE_INVALID',
			id: '70193c39-54f3-4813-82f0-70a680f7495b',
		},
		noSuchObject: {
			message: 'No such object.',
			code: 'NO_SUCH_OBJECT',
			id: 'dc94d745-1262-4e63-a17d-fecaa57efc82',
		},
	},

	res: {
		optional: false, nullable: false,
		oneOf: [
			{
				type: 'object',
				properties: {
					type: {
						type: 'string',
						optional: false, nullable: false,
						enum: ['User'],
					},
					object: {
						type: 'object',
						optional: false, nullable: false,
						ref: 'UserDetailedNotMe',
					},
				},
			},
			{
				type: 'object',
				properties: {
					type: {
						type: 'string',
						optional: false, nullable: false,
						enum: ['Note'],
					},
					object: {
						type: 'object',
						optional: false, nullable: false,
						ref: 'Note',
					},
				},
			},
		],
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		uri: { type: 'string' },
	},
	required: ['uri'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private utilityService: UtilityService,
		private userEntityService: UserEntityService,
		private noteEntityService: NoteEntityService,
		private apResolverService: ApResolverService,
		private apDbResolverService: ApDbResolverService,
		private apPersonService: ApPersonService,
		private apNoteService: ApNoteService,
		private readonly apRequestService: ApRequestService,
		private readonly systemAccountService: SystemAccountService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const object = await this.fetchAny(ps.uri, me);
			if (object) {
				return object;
			} else {
				throw new ApiError(meta.errors.noSuchObject);
			}
		});
	}

	/***
	 * URIからUserかNoteを解決する
	 */
	@bindThis
	private async fetchAny(uri: string, me: MiLocalUser | null | undefined): Promise<SchemaType<typeof meta['res']> | null> {
		if (!this.utilityService.isFederationAllowedUri(uri)) {
			throw new ApiError(meta.errors.federationNotAllowed);
		}

		const local = await this.mergePack(me, ...await Promise.all([
			this.apDbResolverService.getUserFromApId(uri),
			this.apDbResolverService.getNoteFromApId(uri),
		]));
		if (local != null) return local;

		// No local object found with that uri.
		// Before we fetch, resolve the URI in case it has a cross-origin redirect or anything like that.
		// Resolver.resolve() uses strict verification, which is overly paranoid for a user-provided lookup.
		uri = await this.resolveCanonicalUri(uri);
		if (!this.utilityService.isFederationAllowedUri(uri)) {
			throw new ApiError(meta.errors.federationNotAllowed);
		}

		const host = this.utilityService.extractDbHost(uri);

		// local object, not found in db? fail
		if (this.utilityService.isSelfHost(host)) return null;

		// リモートから一旦オブジェクトフェッチ
		const resolver = this.apResolverService.createResolver();
		const object = await resolver.resolve(uri).catch((err) => {
			if (err instanceof IdentifiableError) {
				switch (err.id) {
					// resolve
					case 'b94fd5b1-0e3b-4678-9df2-dad4cd515ab2':
						throw new ApiError(meta.errors.uriInvalid);
					case '0dc86cf6-7cd6-4e56-b1e6-5903d62d7ea5':
					case 'd592da9f-822f-4d91-83d7-4ceefabcf3d2':
						throw new ApiError(meta.errors.requestFailed);
					case '09d79f9e-64f1-4316-9cfa-e75c4d091574':
						throw new ApiError(meta.errors.federationNotAllowed);
					case '72180409-793c-4973-868e-5a118eb5519b':
					case 'd09dc850-b76c-4f45-875a-7389339d78b8':
					case 'dc110060-a5f2-461d-808b-39c62702ca64':
					case '45793ab7-7648-4886-b503-429f8a0d0f73':
					case '4bf8f36b-4d33-4ac9-ad76-63fa11f354e9':
						throw new ApiError(meta.errors.responseInvalid);

					// resolveLocal
					case '02b40cd0-fa92-4b0c-acc9-fb2ada952ab8':
						throw new ApiError(meta.errors.uriInvalid);
					case 'a9d946e5-d276-47f8-95fb-f04230289bb0':
					case '06ae3170-1796-4d93-a697-2611ea6d83b6':
						throw new ApiError(meta.errors.noSuchObject);
					case '7a5d2fc0-94bc-4db6-b8b8-1bf24a2e23d0':
						throw new ApiError(meta.errors.responseInvalid);
				}
			}

			throw new ApiError(meta.errors.requestFailed);
		});

		// Object is already validated to have a valid id (URI).
		// We can pass it through with the same resolver and sentFrom to avoid a duplicate fetch.
		// The resolve* methods automatically check for locally cached copies.
		return await this.mergePack(
			me,
			isActor(object) ? await this.apPersonService.resolvePerson(object, resolver, uri) : null,
			isPost(object) ? await this.apNoteService.resolveNote(object, { resolver, sentFrom: uri }) : null,
		);
	}

	@bindThis
	private async mergePack(me: MiLocalUser | null | undefined, user: MiUser | null | undefined, note: MiNote | null | undefined): Promise<SchemaType<typeof meta.res> | null> {
		if (user != null) {
			return {
				type: 'User',
				object: await this.userEntityService.pack(user, me, { schema: 'UserDetailedNotMe' }),
			};
		} else if (note != null) {
			try {
				const object = await this.noteEntityService.pack(note, me, { detail: true });

				return {
					type: 'Note',
					object,
				};
			} catch (e) {
				return null;
			}
		}

		return null;
	}

	/**
	 * Resolves an arbitrary URI to its canonical, post-redirect form.
	 */
	private async resolveCanonicalUri(uri: string): Promise<string> {
		const user = await this.systemAccountService.getInstanceActor();
		const res = await this.apRequestService.signedGet(uri, user, true);
		return getApId(res);
	}
}
