/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApResolverService } from '@/core/activitypub/ApResolverService.js';
import { isCollectionOrOrderedCollection, isOrderedCollection, isOrderedCollectionPage } from '@/core/activitypub/type.js';
import { ApiError } from '@/server/api/error.js';
import { CacheService } from '@/core/CacheService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DI } from '@/di-symbols.js';
import type { NotesRepository } from '@/models/_.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';

export const meta = {
	tags: ['federation'],

	requireAdmin: true,
	requireCredential: true,
	kind: 'read:federation',

	limit: {
		duration: ms('1hour'),
		max: 30,
	},

	errors: {
		noInputSpecified: {
			message: 'uri, userId, or noteId must be specified.',
			code: 'NO_INPUT_SPECIFIED',
			id: 'b43ff2a7-e7a2-4237-ad7f-7b079563c09e',
		},
		multipleInputsSpecified: {
			message: 'Only one of uri, userId, or noteId can be specified',
			code: 'MULTIPLE_INPUTS_SPECIFIED',
			id: 'f1aa27ed-8f20-44f3-a92a-fe073c8ca52b',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		uri: { type: 'string', nullable: true },
		userId: { type: 'string', format: 'misskey:id', nullable: true },
		noteId: { type: 'string', format: 'misskey:id', nullable: true },
		expandCollectionItems: { type: 'boolean' },
		expandCollectionLimit: { type: 'integer', nullable: true },
		allowAnonymous: { type: 'boolean' },
	},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private readonly notesRepository: NotesRepository,

		private readonly cacheService: CacheService,
		private readonly userEntityService: UserEntityService,
		private readonly noteEntityService: NoteEntityService,
		private apResolverService: ApResolverService,
	) {
		super(meta, paramDef, async (ps) => {
			if (ps.uri && ps.userId && ps.noteId) {
				throw new ApiError(meta.errors.multipleInputsSpecified);
			}

			let uri: string;
			if (ps.uri) {
				uri = ps.uri;
			} else if (ps.userId) {
				const user = await this.cacheService.findUserById(ps.userId);
				uri = user.uri ?? this.userEntityService.genLocalUserUri(ps.userId);
			} else if (ps.noteId) {
				const note = await this.notesRepository.findOneByOrFail({ id: ps.noteId });
				uri = note.uri ?? this.noteEntityService.genLocalNoteUri(ps.noteId);
			} else {
				throw new ApiError(meta.errors.noInputSpecified);
			}

			const resolver = this.apResolverService.createResolver();
			const object = await resolver.resolve(uri, ps.allowAnonymous ?? false);

			if (ps.expandCollectionItems && isCollectionOrOrderedCollection(object)) {
				const items = await resolver.resolveCollectionItems(object, ps.allowAnonymous ?? false, uri, ps.expandCollectionLimit);

				if (isOrderedCollection(object) || isOrderedCollectionPage(object)) {
					object.orderedItems = items;
				} else {
					object.items = items;
				}
			}

			return object;
		});
	}
}
