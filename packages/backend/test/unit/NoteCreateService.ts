/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isRenote, isQuote } from '@/core/NoteCreateService.js';
import { MiNote } from '@/models/Note.js';
import { IPoll } from '@/models/Poll.js';
import { MiDriveFile } from '@/models/DriveFile.js';

describe('NoteCreateService', () => {
	describe('is-renote', () => {
		const base: MiNote = {
			id: 'some-note-id',
			updatedAt: null,
			replyId: null,
			reply: null,
			renoteId: null,
			renote: null,
			threadId: null,
			text: null,
			name: null,
			cw: null,
			userId: 'some-user-id',
			user: null,
			localOnly: false,
			reactionAcceptance: null,
			renoteCount: 0,
			repliesCount: 0,
			clippedCount: 0,
			reactions: {},
			visibility: 'public',
			uri: null,
			url: null,
			fileIds: [],
			attachedFileTypes: [],
			visibleUserIds: [],
			mentions: [],
			mentionedRemoteUsers: '',
			reactionAndUserPairCache: [],
			emojis: [],
			tags: [],
			hasPoll: false,
			channelId: null,
			channel: null,
			userHost: null,
			userInstance: null,
			replyUserId: null,
			replyUserHost: null,
			replyUserInstance: null,
			renoteUserId: null,
			renoteUserHost: null,
			renoteUserInstance: null,
			processErrors: [],
			mandatoryCW: null,
		};

		const poll: IPoll = {
			choices: ['kinoko', 'takenoko'],
			multiple: false,
			expiresAt: null,
		};

		const file: MiDriveFile = {
			id: 'some-file-id',
			userId: null,
			user: null,
			userHost: null,
			md5: '',
			name: '',
			type: '',
			size: 0,
			comment: null,
			blurhash: null,
			properties: {},
			storedInternal: false,
			url: '',
			thumbnailUrl: null,
			webpublicUrl: null,
			webpublicType: null,
			accessKey: null,
			thumbnailAccessKey: null,
			webpublicAccessKey: null,
			uri: null,
			src: null,
			folderId: null,
			folder: null,
			isSensitive: false,
			maybeSensitive: false,
			maybePorn: false,
			isLink: false,
			requestHeaders: null,
			requestIp: null,
		};

		test('note without renote should not be Renote', () => {
			const note = { renote: null };
			expect(isRenote(note)).toBe(false);
		});

		test('note with renote should be Renote and not be Quote', () => {
			const note = { renote: base };
			expect(isRenote(note)).toBe(true);
			expect(isQuote(note)).toBe(false);
		});

		test('note with renote and text should be Quote', () => {
			const note = { renote: base, text: 'some-text' };
			expect(isRenote(note)).toBe(true);
			expect(isQuote(note)).toBe(true);
		});

		test('note with renote and cw should be Quote', () => {
			const note = { renote: base, cw: 'some-cw' };
			expect(isRenote(note)).toBe(true);
			expect(isQuote(note)).toBe(true);
		});

		test('note with renote and reply should be Quote', () => {
			const note = { renote: base, reply: { ...base, id: 'another-note-id' } };
			expect(isRenote(note)).toBe(true);
			expect(isQuote(note)).toBe(true);
		});

		test('note with renote and poll should be Quote', () => {
			const note = { renote: base, poll };
			expect(isRenote(note)).toBe(true);
			expect(isQuote(note)).toBe(true);
		});

		test('note with renote and non-empty files should be Quote', () => {
			const note = { renote: base, files: [file] };
			expect(isRenote(note)).toBe(true);
			expect(isQuote(note)).toBe(true);
		});
	});

	// TODO tests for isPureRenote
});
