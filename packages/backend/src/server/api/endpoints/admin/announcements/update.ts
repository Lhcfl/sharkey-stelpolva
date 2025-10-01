/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AnnouncementsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { AnnouncementService } from '@/core/AnnouncementService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:announcements',

	errors: {
		noSuchAnnouncement: {
			message: 'No such announcement.',
			code: 'NO_SUCH_ANNOUNCEMENT',
			id: 'd3aae5a7-6372-4cb4-b61c-f511ffc2d7cc',
		},
		dialogLimitExceeded: {
			message: 'Cannot create the announcement because there are too many active dialog-style announcements.',
			code: 'DIALOG_LIMIT_EXCEEDED',
			id: '1a5db7ca-6d3f-44bc-ac51-05cae93b643c',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		id: { type: 'string', format: 'misskey:id' },
		title: { type: 'string', minLength: 1 },
		text: { type: 'string', minLength: 1 },
		imageUrl: { type: 'string', nullable: true, minLength: 0 },
		icon: { type: 'string', enum: ['info', 'warning', 'error', 'success'] },
		display: { type: 'string', enum: ['normal', 'banner', 'dialog'] },
		forExistingUsers: { type: 'boolean' },
		forRoles: { type: 'array', default: [], items: { type: 'string', nullable: false, format: 'misskey:id' }, },
		silence: { type: 'boolean' },
		needConfirmationToRead: { type: 'boolean' },
		confetti: { type: 'boolean' },
		isActive: { type: 'boolean' },
	},
	required: ['id'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.announcementsRepository)
		private announcementsRepository: AnnouncementsRepository,

		private announcementService: AnnouncementService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const announcement = await this.announcementsRepository.findOneBy({ id: ps.id });

			if (announcement == null) throw new ApiError(meta.errors.noSuchAnnouncement);

			try {
				await this.announcementService.update(announcement, {
					updatedAt: new Date(),
					title: ps.title,
					text: ps.text,
					/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- 空の文字列の場合、nullを渡すようにするため */
					imageUrl: ps.imageUrl || null,
					display: ps.display,
					icon: ps.icon,
					forExistingUsers: ps.forExistingUsers,
					forRoles: ps.forRoles,
					silence: ps.silence,
					needConfirmationToRead: ps.needConfirmationToRead,
					confetti: ps.confetti,
					isActive: ps.isActive,
				}, me);
			} catch (e) {
				if (e instanceof IdentifiableError) {
					if (e.id === 'c0d15f15-f18e-4a40-bcb1-f310d58204ee') throw new ApiError(meta.errors.dialogLimitExceeded);
				}
				throw e;
			}
		});
	}
}
