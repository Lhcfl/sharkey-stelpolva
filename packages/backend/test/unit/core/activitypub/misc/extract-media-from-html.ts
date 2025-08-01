/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { extractMediaFromHtml } from '@/core/activitypub/misc/extract-media-from-html.js';

describe(extractMediaFromHtml, () => {
	it('should return empty for invalid input', () => {
		const result = extractMediaFromHtml('<broken html');
		expect(result).toEqual([]);
	});

	it('should return empty for empty input', () => {
		const result = extractMediaFromHtml('');
		expect(result).toEqual([]);
	});

	it('should return empty for input without attachments', () => {
		const result = extractMediaFromHtml('<div>No media here!</div>');
		expect(result).toEqual([]);
	});

	it('should extract img tags', () => {
		const result = extractMediaFromHtml('<img src="https://example.com/img.png" alt=""/>');
		expect(result).toEqual([{
			type: 'Image',
			url: 'https://example.com/img.png',
			name: null,
		}]);
	});

	it('should ignore img tags without src', () => {
		const result = extractMediaFromHtml('<img alt=""/>');
		expect(result).toEqual([]);
	});

	it('should extract picture tags with img', () => {
		const result = extractMediaFromHtml('<picture><img src="https://example.com/picture.png" alt=""/></picture>');
		expect(result).toEqual([{
			type: 'Image',
			url: 'https://example.com/picture.png',
			name: null,
		}]);
	});

	it('should ignore picture tags without img', () => {
		const result = extractMediaFromHtml('<picture><source src="https://example.com/picture.png"/></picture>');
		expect(result).toEqual([]);
	});

	it('should ignore picture tags without src', () => {
		const result = extractMediaFromHtml('<picture><source/><img alt=""/></picture>');
		expect(result).toEqual([]);
	});

	it('should extract object tags', () => {
		const result = extractMediaFromHtml('<object data="https://example.com/object.dat"></object>');
		expect(result).toEqual([{
			type: 'Document',
			url: 'https://example.com/object.dat',
			name: null,
		}]);
	});

	it('should ignore object tags without data', () => {
		const result = extractMediaFromHtml('<object></object>');
		expect(result).toEqual([]);
	});

	it('should extract object tags with img fallback', () => {
		const result = extractMediaFromHtml('<object><img src="https://example.com/object.png" alt=""/></object>');
		expect(result).toEqual([{
			type: 'Image',
			url: 'https://example.com/object.png',
			name: null,
		}]);
	});

	it('should ignore object tags with empty img fallback', () => {
		const result = extractMediaFromHtml('<object><img alt=""/></object>');
		expect(result).toEqual([]);
	});

	it('should extract embed tags', () => {
		const result = extractMediaFromHtml('<embed src="https://example.com/embed.dat"/>');
		expect(result).toEqual([{
			type: 'Document',
			url: 'https://example.com/embed.dat',
			name: null,
		}]);
	});

	it('should ignore embed tags without src', () => {
		const result = extractMediaFromHtml('<embed/>');
		expect(result).toEqual([]);
	});

	it('should extract audio tags', () => {
		const result = extractMediaFromHtml('<audio src="https://example.com/audio.mp3"></audio>');
		expect(result).toEqual([{
			type: 'Audio',
			url: 'https://example.com/audio.mp3',
			name: null,
		}]);
	});

	it('should ignore audio tags without src', () => {
		const result = extractMediaFromHtml('<audio></audio>');
		expect(result).toEqual([]);
	});

	it('should extract video tags', () => {
		const result = extractMediaFromHtml('<video src="https://example.com/video.mp4"></video>');
		expect(result).toEqual([{
			type: 'Video',
			url: 'https://example.com/video.mp4',
			name: null,
		}]);
	});

	it('should ignore video tags without src', () => {
		const result = extractMediaFromHtml('<video></video>');
		expect(result).toEqual([]);
	});

	it('should extract alt text from alt property', () => {
		const result = extractMediaFromHtml(`
			<img src="https://example.com/img.png" alt="img tag" title="wrong"/>
			<picture><img src="https://example.com/picture.png" alt="picture tag" title="wrong"/></picture>
			<object data="https://example.com/object-1.dat" alt="object tag" title="wrong"></object>
			<object><img src="https://example.com/object-2.png" alt="object tag" title="wrong"/></object>
			<embed src="https://example.com/embed.dat" alt="embed tag" title="wrong"/>
			<audio src="https://example.com/audio.mp3" alt="audio tag" title="wrong"/>
			<video src="https://example.com/video.mp4" alt="video tag" title="wrong"/>
		`);

		expect(result).toEqual([
			{
				type: 'Image',
				url: 'https://example.com/img.png',
				name: 'img tag',
			},
			{
				type: 'Image',
				url: 'https://example.com/picture.png',
				name: 'picture tag',
			},
			{
				type: 'Image',
				url: 'https://example.com/object-2.png',
				name: 'object tag',
			},
			{
				type: 'Document',
				url: 'https://example.com/object-1.dat',
				name: 'object tag',
			},
			{
				type: 'Document',
				url: 'https://example.com/embed.dat',
				name: 'embed tag',
			},
			{
				type: 'Audio',
				url: 'https://example.com/audio.mp3',
				name: 'audio tag',
			},
			{
				type: 'Video',
				url: 'https://example.com/video.mp4',
				name: 'video tag',
			},
		]);
	});

	it('should extract alt text from title property', () => {
		const result = extractMediaFromHtml(`
			<img src="https://example.com/img.png" title="img tag"/>
			<picture><img src="https://example.com/picture.png" title="picture tag"/></picture>
			<object data="https://example.com/object-1.dat" title="object tag"></object>
			<object><img src="https://example.com/object-2.png" title="object tag"/></object>
			<embed src="https://example.com/embed.dat" title="embed tag"/>
			<audio src="https://example.com/audio.mp3" title="audio tag"/>
			<video src="https://example.com/video.mp4" title="video tag"/>
		`);

		expect(result).toEqual([
			{
				type: 'Image',
				url: 'https://example.com/img.png',
				name: 'img tag',
			},
			{
				type: 'Image',
				url: 'https://example.com/picture.png',
				name: 'picture tag',
			},
			{
				type: 'Image',
				url: 'https://example.com/object-2.png',
				name: 'object tag',
			},
			{
				type: 'Document',
				url: 'https://example.com/object-1.dat',
				name: 'object tag',
			},
			{
				type: 'Document',
				url: 'https://example.com/embed.dat',
				name: 'embed tag',
			},
			{
				type: 'Audio',
				url: 'https://example.com/audio.mp3',
				name: 'audio tag',
			},
			{
				type: 'Video',
				url: 'https://example.com/video.mp4',
				name: 'video tag',
			},
		]);
	});

	it('should ignore missing alt text', () => {
		const result = extractMediaFromHtml(`
			<img src="https://example.com/img.png"/>
			<picture><img src="https://example.com/picture.png"/></picture>
			<object data="https://example.com/object-1.dat"></object>
			<object><img src="https://example.com/object-2.png"/></object>
			<embed src="https://example.com/embed.dat"/>
			<audio src="https://example.com/audio.mp3"/>
			<video src="https://example.com/video.mp4"/>
		`);

		expect(result).toEqual([
			{
				type: 'Image',
				url: 'https://example.com/img.png',
				name: null,
			},
			{
				type: 'Image',
				url: 'https://example.com/picture.png',
				name: null,
			},
			{
				type: 'Image',
				url: 'https://example.com/object-2.png',
				name: null,
			},
			{
				type: 'Document',
				url: 'https://example.com/object-1.dat',
				name: null,
			},
			{
				type: 'Document',
				url: 'https://example.com/embed.dat',
				name: null,
			},
			{
				type: 'Audio',
				url: 'https://example.com/audio.mp3',
				name: null,
			},
			{
				type: 'Video',
				url: 'https://example.com/video.mp4',
				name: null,
			},
		]);
	});

	it('should de-duplicate attachments', () => {
		const result = extractMediaFromHtml(`
			<img src="https://example.com/1.png" alt="img 1"/>
			<img src="https://example.com/2.png" alt="img 2"/>
			<embed src="https://example.com/1.png" alt="embed 1"/>
		`);

		expect(result).toEqual([
			{
				type: 'Document',
				url: 'https://example.com/1.png',
				name: 'embed 1',
			},
			{
				type: 'Image',
				url: 'https://example.com/2.png',
				name: 'img 2',
			},
		]);
	});
});
