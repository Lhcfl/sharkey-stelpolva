/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';

interface InputNote {
	userId: MiUser['id'];
	replyId?: MiNote['id'] | null;
	replyUserId?: MiUser['id'] | null;
	reply?: {
		id: MiNote['id'];
		userId: MiUser['id'];
	} | null;
}

// Should really be named "isReplyToOther"
export function isReply(note: InputNote, viewerId?: MiUser['id'] | undefined | null): boolean {
	const replyId = note.reply?.id ?? note.replyId;
	const replyUserId = note.reply?.userId ?? note.replyUserId;
	return replyId != null && replyUserId !== note.userId && replyUserId !== viewerId;
}
