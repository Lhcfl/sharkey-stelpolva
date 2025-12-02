/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';

// Should really be named "isReplyToOther"
export function isReply(note: MiNote, viewerId?: MiUser['id'] | undefined | null): boolean {
	return note.replyId != null && note.replyUserId !== note.userId && note.replyUserId !== viewerId;
}
