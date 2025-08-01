/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { extractMediaFromMfm } from '@/core/activitypub/misc/extract-media-from-mfm.js';

describe(extractMediaFromMfm, () => {
	it('should return empty for empty input', () => {
		const result = extractMediaFromMfm('');
		expect(result).toEqual([]);
	});

	it('should return empty for invalid input', () => {
		const result = extractMediaFromMfm('*broken markdown\0');
		expect(result).toEqual([]);
	});

	it('should extract all image links', () => {
		const result = extractMediaFromMfm(`
			![1](https://example.com/images/1.png)
			![](https://example.com/images/2.png)
			**![3](https://example.com/images/3.png)**
		`);

		expect(result).toEqual([
			{
				type: 'Image',
				url: 'https://example.com/images/1.png',
				name: '1',
			},
			{
				type: 'Image',
				url: 'https://example.com/images/2.png',
				name: null,
			},
			{
				type: 'Image',
				url: 'https://example.com/images/3.png',
				name: '3',
			},
		]);
	});

	it('should ignore regular links', () => {
		const result = extractMediaFromMfm(`
			[1](https://example.com/images/1.png)
			[](https://example.com/images/2.png)
			**[3](https://example.com/images/3.png)**
		`);

		expect(result).toEqual([]);
	});

	it('should ignore silent links', () => {
		const result = extractMediaFromMfm(`
			?[1](https://example.com/images/1.png)
			?[](https://example.com/images/2.png)
			**?[3](https://example.com/images/3.png)**
		`);

		expect(result).toEqual([]);
	});

	it('should extract complex text', () => {
		const result = extractMediaFromMfm('![this is an **image** with *complex* text! :owo: 💙](https://example.com/image.png)');

		expect(result).toEqual([
			{
				type: 'Image',
				url: 'https://example.com/image.png',
				name: 'this is an image with complex text! :owo: 💙',
			},
		]);
	});

	it('should de-duplicate images', () => {
		const result = extractMediaFromMfm(`
			![1](https://example.com/images/1.png)
			![](https://example.com/images/1.png)
			**![3](https://example.com/images/1.png)**
		`);

		expect(result).toEqual([
			{
				type: 'Image',
				url: 'https://example.com/images/1.png',
				name: '3',
			},
		]);
	});
});
