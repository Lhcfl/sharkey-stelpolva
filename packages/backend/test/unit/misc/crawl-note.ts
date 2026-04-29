/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { crawlNote } from '@/misc/crawl-note.js';
import { Packed } from '@/misc/json-schema.js';

describe(crawlNote, () => {
	it('should include the input note', () => {
		const input = {} as Packed<'Note'>;

		const result = crawlNote(input);

		expect(result).toHaveLength(1);
		expect(result).toContain(input);
	});

	it('should include the input note\'s renote', () => {
		const input = {
			renote: {},
		} as Packed<'Note'>;

		const result = crawlNote(input);

		expect(result).toHaveLength(2);
		expect(result).toContain(input);
		expect(result).toContain(input.renote);
	});

	it('should include the input note\'s renote renote', () => {
		const input = {
			renote: {
				renote: {},
			},
		} as Packed<'Note'>;

		const result = crawlNote(input);

		expect(result).toHaveLength(3);
		expect(result).toContain(input);
		expect(result).toContain(input.renote);
		expect(result).toContain(input.renote?.renote);
	});

	it('should include the input note\'s renote reply', () => {
		const input = {
			renote: {
				reply: {},
			},
		} as Packed<'Note'>;

		const result = crawlNote(input);

		expect(result).toHaveLength(3);
		expect(result).toContain(input);
		expect(result).toContain(input.renote);
		expect(result).toContain(input.renote?.reply);
	});

	it('should include the input note\'s reply', () => {
		const input = {
			reply: {},
		} as Packed<'Note'>;

		const result = crawlNote(input);

		expect(result).toHaveLength(2);
		expect(result).toContain(input);
		expect(result).toContain(input.reply);
	});

	it('should include the input note\'s reply renote', () => {
		const input = {
			reply: {
				renote: {},
			},
		} as Packed<'Note'>;

		const result = crawlNote(input);

		expect(result).toHaveLength(3);
		expect(result).toContain(input);
		expect(result).toContain(input.reply);
		expect(result).toContain(input.reply?.renote);
	});

	it('should include the input note\'s reply reply', () => {
		const input = {
			reply: {
				reply: {},
			},
		} as Packed<'Note'>;

		const result = crawlNote(input);

		expect(result).toHaveLength(3);
		expect(result).toContain(input);
		expect(result).toContain(input.reply);
		expect(result).toContain(input.reply?.reply);
	});

	it('should include all instances of the same note', () => {
		const input = {
			reply: {
				id: '1',
			},
			renote: {
				id: '1',
			},
		} as Packed<'Note'>;

		const result = crawlNote(input);

		expect(result).toHaveLength(3);
		expect(result).toContain(input);
		expect(result).toContain(input.reply);
		expect(result).toContain(input.renote);
	});

	it('should include each instance only once', () => {
		const replyRenoteReplyRenote = {} as Packed<'Note'>;
		const input = {
			reply: {
				id: '1',
				reply: replyRenoteReplyRenote,
				renote: replyRenoteReplyRenote,
			},
			renote: {
				id: '1',
				reply: replyRenoteReplyRenote,
				renote: replyRenoteReplyRenote,
			},
		} as Packed<'Note'>;

		const result = crawlNote(input);

		expect(result).toHaveLength(4);
		expect(result).toContain(input);
		expect(result).toContain(input.reply);
		expect(result).toContain(input.renote);
		expect(result).toContain(replyRenoteReplyRenote);
	});

	it('should write into existing array if provided', () => {
		const input1 = {} as Packed<'Note'>;
		const input2 = {} as Packed<'Note'>;
		const output = [input1];

		const result = crawlNote(input2, output);

		expect(result).toBe(output);
		expect(result).toHaveLength(2);
		expect(result).toContain(input1);
		expect(result).toContain(input2);
	});

	it('should skip duplicates in existing array', () => {
		const input1 = {} as Packed<'Note'>;
		const input2 = {
			reply: input1,
		} as Packed<'Note'>;
		const output = [input1];

		const result = crawlNote(input2, output);

		expect(result).toBe(output);
		expect(result).toHaveLength(2);
		expect(result).toContain(input1);
		expect(result).toContain(input2);
	});
});
