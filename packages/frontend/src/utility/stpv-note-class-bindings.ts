
import { isPureRenote } from 'misskey-js/note.js';
import type * as Misskey from 'misskey-js';
import { $i } from '@/account.js';

export function stpvNoteClassBindings(notep: Misskey.entities.Note) {
	let note = notep;
	const res: string[] = [];
	if (isPureRenote(note)) {
		note = note.renote;
		res.push('d-is-renote');
	}
	if (note.renoteId) {
		res.push('d-is-quote');
	}
	if (note.replyId) res.push('d-is-reply');
	if (note.userId === $i?.id) res.push('d-is-mine');
	if (note.user.host) res.push('d-is-remote');
	if (!note.user.host) res.push('d-is-local');
	res.push(`d-${note.visibility}`);
	if (note.visibility === 'specified' && note.visibleUserIds?.length === 0) {
		res.push('d-private');
	}
	return res;
}
