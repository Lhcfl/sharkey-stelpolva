/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { appendContentWarning } from '@@/js/append-content-warning.js';
import { host } from '@@/js/config.js';
import { i18n } from '@/i18n.js';

/**
 * 投稿を表す文字列を取得します。
 * @param note (packされた)投稿
 * @param withMandatoryCw if true (default), include the note/user/instance mandatory CW
 */
export const getNoteSummary = (note: Misskey.entities.Note | null | undefined, withMandatoryCw = true): string => {
	if (note == null) {
		return '';
	}

	if (note.deletedAt) {
		return `(${i18n.ts.deletedNote})`;
	}

	if (note.isHidden) {
		return `(${i18n.ts.invisibleNote})`;
	}

	let summary = '';

	// Append mandatory CW, if applicable
	let cw = note.cw;
	if (withMandatoryCw) {
		if (note.mandatoryCW) {
			cw = appendContentWarning(cw, i18n.tsx.noteIsFlaggedAs({ cw: note.mandatoryCW }));
		}
		if (note.user.mandatoryCW) {
			const username = note.user.host
				? `@${note.user.username}@${note.user.host}`
				: `@${note.user.username}`;
			cw = appendContentWarning(cw, i18n.tsx.userIsFlaggedAs({ name: username, cw: note.user.mandatoryCW }));
		}
		if (note.user.instance?.mandatoryCW) {
			const instanceName = note.user.host ?? host;
			cw = appendContentWarning(cw, i18n.tsx.instanceIsFlaggedAs({ name: instanceName, cw: note.user.instance.mandatoryCW }));
		}
	}

	// 本文
	if (cw != null) {
		summary += `CW: ${cw}`;
	} else if (note.text) {
		summary += note.text;
	}

	// ファイルが添付されているとき
	if (note.files && note.files.length !== 0) {
		summary += ` (${i18n.tsx.withNFiles({ n: note.files.length })})`;
	}

	// 投票が添付されているとき
	if (note.poll) {
		summary += ` (${i18n.ts.poll})`;
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
