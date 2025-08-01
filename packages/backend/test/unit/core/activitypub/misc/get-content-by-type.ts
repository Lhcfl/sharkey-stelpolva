/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getContentByType } from '@/core/activitypub/misc/get-content-by-type.js';

describe(getContentByType, () => {
	describe('when permissive', () => {
		it('should return source.content when it matches', () => {
			const obj = {
				source: {
					content: 'source content',
				},
				_misskey_content: 'misskey content',
				content: 'native content',
				mediaType: 'text/x.misskeYMarkdown, text/markdown',
			};

			const content = getContentByType(obj, 'text/x.misskeymarkdown', true);

			expect(content).toBe('source content');
		});

		it('should return _misskey_content when it matches', () => {
			const obj = {
				source: {
					content: 'source content',
					mediaType: 'text/plain',
				},
				_misskey_content: 'misskey content',
				content: 'native content',
				mediaType: 'text/x.misskeYMarkdown, text/markdown',
			};

			const content = getContentByType(obj, 'text/x.misskeymarkdown', true);

			expect(content).toBe('misskey content');
		});

		it('should return content when it matches', () => {
			const obj = {
				source: {
					content: 'source content',
					mediaType: 'text/plain',
				},
				_misskey_content: null,
				content: 'native content',
				mediaType: 'text/x.misskeYMarkdown, text/markdown',
			};

			const content = getContentByType(obj, 'text/x.misskeymarkdown', true);

			expect(content).toBe('native content');
		});

		it('should return null when nothing matches', () => {
			const obj = {
				source: {
					content: 'source content',
					mediaType: 'text/plain',
				},
				_misskey_content: null,
				content: 'native content',
				mediaType: 'text/plain',
			};

			const content = getContentByType(obj, 'text/x.misskeymarkdown', true);

			expect(content).toBe(null);
		});

		it('should return null for invalid inputs', () => {
			const objects = [
				{},
				{ source: 'nope' },
				{ content: null },
				{ _misskey_content: 123 },
			];

			const results = objects.map(c => getContentByType(c, 'text/misskeymarkdown', true));

			const expected = objects.map(() => null);
			expect(results).toEqual(expected);
		});
	});

	describe('when not permissive', () => {
		it('should return source.content when it matches', () => {
			const obj = {
				source: {
					content: 'source content',
					mediaType: 'text/x.misskeymarkdown',
				},
				_misskey_content: 'misskey content',
				content: 'native content',
				mediaType: 'text/x.misskeymarkdown',
			};

			const content = getContentByType(obj, 'text/x.misskeymarkdown');

			expect(content).toBe('source content');
		});

		it('should return _misskey_content when it matches', () => {
			const obj = {
				source: {
					content: 'source content',
					mediaType: 'text/plain',
				},
				_misskey_content: 'misskey content',
				content: 'native content',
				mediaType: 'text/x.misskeymarkdown',
			};

			const content = getContentByType(obj, 'text/x.misskeymarkdown');

			expect(content).toBe('misskey content');
		});

		it('should return content when it matches', () => {
			const obj = {
				source: {
					content: 'source content',
					mediaType: 'text/plain',
				},
				_misskey_content: null,
				content: 'native content',
				mediaType: 'text/x.misskeymarkdown',
			};

			const content = getContentByType(obj, 'text/x.misskeymarkdown');

			expect(content).toBe('native content');
		});

		it('should return null when nothing matches', () => {
			const obj = {
				source: {
					content: 'source content',
					mediaType: 'text/plain',
				},
				_misskey_content: null,
				content: 'native content',
				mediaType: 'text/plain',
			};

			const content = getContentByType(obj, 'text/x.misskeymarkdown');

			expect(content).toBe(null);
		});

		it('should return null for invalid inputs', () => {
			const objects = [
				{},
				{ source: 'nope' },
				{ content: null },
				{ _misskey_content: 123 },
			];

			const results = objects.map(c => getContentByType(c, 'text/misskeymarkdown'));

			const expected = objects.map(() => null);
			expect(results).toEqual(expected);
		});
	});
});
