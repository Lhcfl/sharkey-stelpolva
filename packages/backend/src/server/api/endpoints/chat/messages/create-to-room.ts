/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { ChatService } from '@/core/ChatService.js';
import type { DriveFilesRepository, MiUser, MiDriveFile } from '@/models/_.js';
import type { Config } from '@/config.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	// Up to 10 message burst, then 2/second
	limit: {
		type: 'bucket',
		size: 10,
		dripRate: 500,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatMessageLiteForRoom',
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: '8098520d-2da5-4e8f-8ee1-df78b55a4ec6',
		},

		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'b6accbd3-1d7b-4d9f-bdb7-eb185bac06db',
		},

		contentRequired: {
			message: 'Content required. You need to set text or fileId.',
			code: 'CONTENT_REQUIRED',
			id: '340517b7-6d04-42c0-bac1-37ee804e3594',
		},

		maxLength: {
			message: 'You tried posting a message which is too long.',
			code: 'MAX_LENGTH',
			id: '3ac74a84-8fd5-4bb0-870f-01804f82ce16',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		text: { type: 'string', nullable: true, minLength: 1 },
		fileId: { type: 'string', format: 'misskey:id' },
		toRoomId: { type: 'string', format: 'misskey:id' },
	},
	required: ['toRoomId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.config)
		private config: Config,

		private getterService: GetterService,
		private chatService: ChatService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			if (ps.text && ps.text.length > this.config.maxNoteLength) {
				throw new ApiError(meta.errors.maxLength);
			}

			const room = await this.chatService.findRoomById(ps.toRoomId);
			if (room == null) {
				throw new ApiError(meta.errors.noSuchRoom);
			}

			let file: MiDriveFile | null = null;
			if (ps.fileId != null) {
				file = await this.driveFilesRepository.findOneBy({
					id: ps.fileId,
					userId: me.id,
				});

				if (file == null) {
					throw new ApiError(meta.errors.noSuchFile);
				}
			}

			// テキストが無いかつ添付ファイルも無かったらエラー
			if (ps.text == null && file == null) {
				throw new ApiError(meta.errors.contentRequired);
			}

			return await this.chatService.createMessageToRoom(me, room, {
				text: ps.text,
				file: file,
			});
		});
	}
}
