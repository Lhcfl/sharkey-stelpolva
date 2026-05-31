/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'assert';
import { MockEnvService } from '../misc/MockEnvService.js';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/Meta.js';
import { ApMfmService } from '@/core/activitypub/ApMfmService.js';
import { MfmService } from '@/core/MfmService.js';
import { UtilityService } from '@/core/UtilityService.js';

describe('ApMfmService', () => {
	let config: Config;
	let meta: MiMeta;
	let envService: MockEnvService;
	let utilityService: UtilityService;
	let mfmService: MfmService;
	let apMfmService: ApMfmService;

	beforeEach(() => {
		config = {
			url: 'https://example.com',
			host: 'example.com',
			id: 'aidx',
		} as unknown as Config;
		meta = {} as unknown as MiMeta;
		envService = new MockEnvService();
		utilityService = new UtilityService(config, meta, envService);
		mfmService = new MfmService(config, utilityService);
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
			assert.equal(content, '<p>テキスト <a href="https://example.com/tags/タグ" rel="tag">#タグ</a> <a href="https://example.com/@mention" class="u-url mention">@mention</a> 🍊 ​:emoji:​ <a href="https://example.com">https://example.com</a></p>', 'content');
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
