import * as Misskey from 'misskey-js';
import type { Ref } from 'vue';
import { defaultStore } from '@/store.js';

export const checkStpvSoftMute = (appearNote: Ref<Misskey.entities.Note>) => {
	if (defaultStore.reactiveState.stpvClientMutedNotes.value.includes(appearNote.value.id)) { return true; }
	if (appearNote.value.replyId && defaultStore.reactiveState.stpvClientMutedNotes.value.includes(appearNote.value.replyId)) { return true; }
	if (appearNote.value.renoteId && defaultStore.reactiveState.stpvClientMutedNotes.value.includes(appearNote.value.renoteId)) { return true; }
	if (defaultStore.reactiveState.stpvClientMutedUsers.value.includes(appearNote.value.userId)) { return true; }
	if (appearNote.value.reply && defaultStore.reactiveState.stpvClientMutedUsers.value.includes(appearNote.value.reply.userId)) { return true; }
	if (appearNote.value.renote && defaultStore.reactiveState.stpvClientMutedUsers.value.includes(appearNote.value.renote.userId)) { return true; }
	return false;
};
