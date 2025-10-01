import type * as Misskey from 'misskey-js';
import { store } from '@/store';

type StpvMute = { reason?: string, detail?: string };

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

export const checkStpvSoftMute = (note: Misskey.entities.Note) : StpvMute => {
	if (checkForSub(note, n => store.r.stpvClientMutedNotes.value.includes(n.id))) { return { reason: 'noteMuted' }; }
	if (checkForSub(note, n => store.r.stpvClientMutedUsers.value.includes(n.userId))) { return { reason: 'authorMuted' }; }
	const domain = checkForSub(note, n => (
		n.user.host && store.r.stpvClientMutedDomains.value.includes(n.user.host)) ? n.user.host : false,
	);
	if (domain) { return { reason: 'domainMuted', detail: domain }; }
	return {};
};
