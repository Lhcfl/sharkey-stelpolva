import * as Misskey from 'misskey-js';
import type { Ref } from 'vue';
import { defaultStore } from '@/store.js';

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
	if (checkForSub(note.value, n => defaultStore.reactiveState.stpvClientMutedNotes.value.includes(n.id))) { return true;}
	if (checkForSub(note.value, n => defaultStore.reactiveState.stpvClientMutedUsers.value.includes(n.userId))) { return true; }
	return checkForSub(note.value, n => (
		n.user.host && defaultStore.reactiveState.stpvClientMutedDomains.value.includes(n.user.host)) ? `mutedByDomain:${n.user.host}` : false,
	);
};
