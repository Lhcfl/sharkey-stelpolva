/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'assert';
import type { Config } from '@/config.js';
import { ApMfmService } from '@/core/activitypub/ApMfmService.js';
import { MfmService } from '@/core/MfmService.js';

describe('ApMfmService', () => {
	let config: Config;
	let mfmService: MfmService;
	let apMfmService: ApMfmService;

	beforeEach(() => {
		config = {
			url: 'http://misskey.local',
		} as unknown as Config;
		mfmService = new MfmService(config);
		apMfmService = new ApMfmService(mfmService);
	});

	describe('getNoteHtml', () => {
		test('Do not provide _misskey_content for simple text', () => {
			const note = {
				text: 'テキスト #タグ @mention 🍊 :emoji: https://example.com',
				mentionedRemoteUsers: '[]',
			};

			const { content, noMisskeyContent } = apMfmService.getNoteHtml(note);

			assert.equal(noMisskeyContent, true, 'noMisskeyContent');
			assert.equal(content, '<p>テキスト <a href="http://misskey.local/tags/タグ" rel="tag">#タグ</a> <a href="http://misskey.local/@mention" class="u-url mention">@mention</a> 🍊 ​:emoji:​ <a href="https://example.com">https://example.com</a></p>', 'content');
		});

		test('Provide _misskey_content for MFM', () => {
			const note = {
				text: '$[tada foo]',
				mentionedRemoteUsers: '[]',
			};

			const { content, noMisskeyContent } = apMfmService.getNoteHtml(note);

			assert.equal(noMisskeyContent, false, 'noMisskeyContent');
			assert.equal(content, '<p><i>foo</i></p>', 'content');
		});
	});
});
