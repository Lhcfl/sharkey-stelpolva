import { store } from '@/store';
import * as Misskey from 'misskey-js';
import type { Ref } from 'vue';

function checkForSub<T>(note: Misskey.entities.Note, fn: (n: Misskey.entities.Note) => T) {
	let res = fn(note);
	if (res) return res;
	if (note.reply) {
		res = fn(note.reply);
		if (res) return res;
	}
	if (note.renote) {
		res = fn(note.renote);
		if (res) return res;
	}
	return false;
}

export const checkStpvSoftMute = (note: Ref<Misskey.entities.Note>) => {
	if (checkForSub(note.value, n => store.r.stpvClientMutedNotes.value.includes(n.id))) { return true;}
	if (checkForSub(note.value, n => store.r.stpvClientMutedUsers.value.includes(n.userId))) { return true; }
	return checkForSub(note.value, n => (
		n.user.host && store.r.stpvClientMutedDomains.value.includes(n.user.host)) ? `mutedByDomain:${n.user.host}` : false,
	);
};
