/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Packed } from './json-schema.js';

/**
 * 投稿を表す文字列を取得します。
 * @param {*} note (packされた)投稿
 */
export const getNoteSummary = (note: Packed<'Note'>): string => {
	if (note.deletedAt) {
		return '(❌⛔)';
	}

	if (note.isHidden) {
		return '(⛔)';
	}

	let summary = '';

	// 本文
	if (note.cw != null) {
		summary += `CW: ${note.cw}`;
	} else if (note.text) {
		summary += note.text;
	}

	// ファイルが添付されているとき
	if (note.files && note.files.length !== 0) {
		summary += ` (📎${note.files.length})`;
	}

	// 投票が添付されているとき
	if (note.poll) {
		summary += ' (📊)';
	}

	// 返信のとき
	if (note.replyId) {
		if (note.reply && !note.cw) {
			summary += `\n\nRE: ${getNoteSummary(note.reply)}`;
		} else {
			summary += '\n\nRE: ...';
		}
	}

	// Renoteのとき
	if (note.renoteId) {
		if (note.renote && !note.cw) {
			summary += `\n\nRN: ${getNoteSummary(note.renote)}`;
		} else {
			summary += '\n\nRN: ...';
		}
	}

	return summary.trim();
};
