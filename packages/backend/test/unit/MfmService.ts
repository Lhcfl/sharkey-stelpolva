/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'assert';
import * as mfm from 'mfm-js';
import { MockEnvService } from '../misc/MockEnvService.js';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/Meta.js';
import { MfmService } from '@/core/MfmService.js';
import { UtilityService } from '@/core/UtilityService.js';

describe('MfmService', () => {
	let config: Config;
	let meta: MiMeta;
	let envService: MockEnvService;
	let utilityService: UtilityService;
	let mfmService: MfmService;

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
	});

	describe('toHtml', () => {
		test('br', () => {
			const input = 'foo\nbar\nbaz';
			const output = '<p><span>foo<br>bar<br>baz</span></p>';
			assert.equal(mfmService.toHtml(mfm.parse(input)), output);
		});

		test('br alt', () => {
			const input = 'foo\r\nbar\rbaz';
			const output = '<p><span>foo<br>bar<br>baz</span></p>';
			assert.equal(mfmService.toHtml(mfm.parse(input)), output);
		});

		test('Do not generate unnecessary span', () => {
			const input = 'foo $[tada bar]';
			const output = '<p>foo <i>bar</i></p>';
			assert.equal(mfmService.toHtml(mfm.parse(input)), output);
		});

		test('escape', () => {
			const input = '```\n<p>Hello, world!</p>\n```';
			const output = '<p><pre><code>&lt;p&gt;Hello, world!&lt;/p&gt;</code></pre></p>';
			assert.equal(mfmService.toHtml(mfm.parse(input)), output);
		});

		test('ruby', () => {
			const input = '$[ruby some text ignore me]';
			const output = '<p><ruby>some<rp>(</rp><rt>text</rt><rp>)</rp></ruby></p>';
			assert.equal(mfmService.toHtml(mfm.parse(input)), output);
		});

		test('ruby2', () => {
			const input = '$[ruby *some text* ignore me]';
			const output = '<p><ruby><i>some text</i><rp>(</rp><rt>ignore me</rt><rp>)</rp></ruby></p>';
			assert.equal(mfmService.toHtml(mfm.parse(input)), output);
		});

		test('ruby 3', () => {
			const input = '$[ruby $[group *some* text] ignore me]';
			const output = '<p><ruby><span><i>some</i> text</span><rp>(</rp><rt>ignore me</rt><rp>)</rp></ruby></p>';
			assert.equal(mfmService.toHtml(mfm.parse(input)), output);
		});

		test('inline', () => {
			const input = 'https://example.com';
			const output = '<a href="https://example.com">https://example.com</a>';
			assert.equal(mfmService.toHtml(mfm.parse(input), [], [], true), output);
		});
	});

	describe('toMastoApiHtml', () => {
		test('br', () => {
			const input = 'foo\nbar\nbaz';
			const output = '<p><span>foo<br>bar<br>baz</span></p>';
			assert.equal(mfmService.toMastoApiHtml(mfm.parse(input)), output);
		});

		test('br alt', () => {
			const input = 'foo\r\nbar\rbaz';
			const output = '<p><span>foo<br>bar<br>baz</span></p>';
			assert.equal(mfmService.toMastoApiHtml(mfm.parse(input)), output);
		});

		test('escape', () => {
			const input = '```\n<p>Hello, world!</p>\n```';
			const output = '<p><pre><code>&lt;p&gt;Hello, world!&lt;/p&gt;</code></pre></p>';
			assert.equal(mfmService.toMastoApiHtml(mfm.parse(input)), output);
		});

		test('ruby', async () => {
			const input = '$[ruby $[group *some* text] ignore me]';
			const output = '<p><ruby><span><span>*some*</span> text</span><rp>(</rp><rt>ignore me</rt><rp>)</rp></ruby></p>';
			assert.equal(await mfmService.toMastoApiHtml(mfm.parse(input)), output);
		});
	});

	describe('fromHtml', () => {
		test('p', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<p>a</p><p>b</p>'), 'a\n\nb');
		});

		test('block element', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<div>a</div><div>b</div>'), 'a\nb');
		});

		test('inline element', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<ul><li>a</li><li>b</li></ul>'), 'a\nb');
		});

		test('block code', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<pre><code>a\nb</code></pre>'), '```\na\nb\n```');
		});

		test('inline code', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<code>a</code>'), '`a`');
		});

		test('quote', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<blockquote>a\nb</blockquote>'), '> a\n> b');
		});

		test('br', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<p>abc<br><br/>d</p>'), 'abc\n\nd');
		});

		test('link with different text', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<p>a <a href="https://example.com/b">c</a> d</p>'), 'a [c](https://example.com/b) d');
		});

		test('link with different text, but not encoded', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<p>a <a href="https://example.com/ä">c</a> d</p>'), 'a [c](<https://example.com/ä>) d');
		});

		test('link with same text', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<p>a <a href="https://example.com/b">https://example.com/b</a> d</p>'), 'a https://example.com/b d');
		});

		test('link with same text, but not encoded', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<p>a <a href="https://example.com/ä">https://example.com/ä</a> d</p>'), 'a <https://example.com/ä> d');
		});

		test('link with no url', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<p>a <a href="b">c</a> d</p>'), 'a [c](b) d');
		});

		test('link without href', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<p>a <a>c</a> d</p>'), 'a c d');
		});

		test('link without text', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<p>a <a href="https://example.com/b"></a> d</p>'), 'a https://example.com/b d');
		});

		test('link without both', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<p>a <a></a> d</p>'), 'a  d');
		});

		test('ruby', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<p>a <ruby>Misskey<rp>(</rp><rt>ミスキー</rt><rp>)</rp></ruby> b</p>'), 'a $[ruby Misskey ミスキー] b');
			assert.deepStrictEqual(mfmService.fromHtml('<p>a <ruby>Misskey<rp>(</rp><rt>ミスキー</rt><rp>)</rp>Misskey<rp>(</rp><rt>ミスキー</rt><rp>)</rp></ruby> b</p>'), 'a $[ruby Misskey ミスキー]$[ruby Misskey ミスキー] b');
		});

		test('ruby with spaces', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<p>a <ruby>Miss key<rp>(</rp><rt>ミスキー</rt><rp>)</rp> b</ruby> c</p>'), 'a $[ruby $[group Miss key] ミスキー] b c');
			assert.deepStrictEqual(mfmService.fromHtml('<p>a <ruby>Misskey<rp>(</rp><rt>ミス キー</rt><rp>)</rp> b</ruby> c</p>'), 'a $[ruby $[group Misskey] ミス キー] b c');
			assert.deepStrictEqual(
				mfmService.fromHtml('<p>a <ruby>Misskey<rp>(</rp><rt>ミスキー</rt><rp>)</rp>Misskey<rp>(</rp><rt>ミス キー</rt><rp>)</rp>Misskey<rp>(</rp><rt>ミスキー</rt><rp>)</rp></ruby> b</p>'),
				'a $[ruby Misskey ミスキー]$[ruby $[group Misskey] ミス キー]$[ruby Misskey ミスキー] b',
			);
		});

		test('ruby with other inline tags', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<p>a <ruby><strong>Misskey</strong><rp>(</rp><rt>ミスキー</rt><rp>)</rp> b</ruby> c</p>'), 'a $[ruby **Misskey** ミスキー] b c');
		});

		test('mention', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<p>a <a href="https://example.com/@user" class="u-url mention">@user</a> d</p>'), 'a @user@example.com d');
		});

		test('hashtag', () => {
			assert.deepStrictEqual(mfmService.fromHtml('<p>a <a href="https://example.com/tags/a">#a</a> d</p>', ['#a']), 'a #a d');
		});

		test('ruby', () => {
			assert.deepStrictEqual(
				mfmService.fromHtml('<ruby> <i>some</i> text <rp>(</rp><rt>ignore me</rt><rp>)</rp> and <rt>more</rt></ruby>'),
				'$[ruby $[group  <i>some</i> text ] ignore me]$[ruby $[group  and ] more]',
			);
		});
	});

	describe('extractMentions', () => {
		test('should extract local mentions', () => {
			const ast = mfm.parse('@foo @bar @baz');
			const mentions = mfmService.extractMentions(ast);
			assert.deepStrictEqual(mentions, [{
				username: 'foo',
				acct: '@foo',
				host: null,
			}, {
				username: 'bar',
				acct: '@bar',
				host: null,
			}, {
				username: 'baz',
				acct: '@baz',
				host: null,
			}]);
		});

		test('should extract remote mentions', () => {
			const ast = mfm.parse('@foo@1.example.com @bar@2.example.com @baz@3.example.com');
			const mentions = mfmService.extractMentions(ast);
			assert.deepStrictEqual(mentions, [{
				username: 'foo',
				acct: '@foo@1.example.com',
				host: '1.example.com',
			}, {
				username: 'bar',
				acct: '@bar@2.example.com',
				host: '2.example.com',
			}, {
				username: 'baz',
				acct: '@baz@3.example.com',
				host: '3.example.com',
			}]);
		});

		test('should extract mixed mentions', () => {
			const ast = mfm.parse('@foo @bar@2.example.com @baz@3.example.com');
			const mentions = mfmService.extractMentions(ast);
			assert.deepStrictEqual(mentions, [{
				username: 'foo',
				acct: '@foo',
				host: null,
			}, {
				username: 'bar',
				acct: '@bar@2.example.com',
				host: '2.example.com',
			}, {
				username: 'baz',
				acct: '@baz@3.example.com',
				host: '3.example.com',
			}]);
		});

		test('should skip duplicate mentions', () => {
			const ast = mfm.parse('@foo@1.example.com @FOO@1.example.com @foo@1.EXAMPLE.com');
			const mentions = mfmService.extractMentions(ast);
			assert.deepStrictEqual(mentions, [{
				username: 'foo',
				acct: '@foo@1.example.com',
				host: '1.example.com',
			}]);
		});

		test('should normalize to selfHost', () => {
			const ast = mfm.parse('@foo');
			const mentions = mfmService.extractMentions(ast, '1.example.com');
			assert.deepStrictEqual(mentions, [{
				username: 'foo',
				acct: '@foo@1.example.com',
				host: '1.example.com',
			}]);
		});

		test('should normalize to local host', () => {
			const ast = mfm.parse('@foo @foo@example.com');
			const mentions = mfmService.extractMentions(ast, 'example.com');
			assert.deepStrictEqual(mentions, [{
				username: 'foo',
				acct: '@foo',
				host: null,
			}]);
		});

		test('should extract nested mentions', () => {
			const ast = mfm.parse('@foo **@bar** @baz');
			const mentions = mfmService.extractMentions(ast);
			assert.deepStrictEqual(mentions, [{
				username: 'foo',
				acct: '@foo',
				host: null,
			}, {
				username: 'bar',
				acct: '@bar',
				host: null,
			}, {
				username: 'baz',
				acct: '@baz',
				host: null,
			}]);
		});
	});
});
