<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

Displays a note with either Misskey or Sharkey style, based on user preference.
-->

<template>
<XNote
	ref="rootEl"
	:note="note"
	:pinned="pinned"
	:mock="mock"
	:withHardMute="withHardMute"
	@reaction="emoji => emit('reaction', emoji)"
	@removeReaction="emoji => emit('removeReaction', emoji)"
	@expandMute="n => onExpandNote(n)"
/>
</template>

<script setup lang="ts">
import * as Misskey from 'misskey-js';
import { defineAsyncComponent, useTemplateRef } from 'vue';
import type { ComponentExposed } from 'vue-component-type-helpers';
import type MkNote from '@/components/MkNote.vue';
import type SkNote from '@/components/SkNote.vue';
import { prefer } from '@/preferences';
import { deepAssign } from '@/utility/merge';
import { useMuteOverrides } from '@/utility/check-word-mute';

const XNote = defineAsyncComponent(() =>
	prefer.s.noteDesign === 'misskey'
		? import('@/components/MkNote.vue')
		: import('@/components/SkNote.vue'));

const rootEl = useTemplateRef<ComponentExposed<typeof MkNote | typeof SkNote>>('rootEl');
const muteOverrides = useMuteOverrides();

defineExpose({ rootEl });

const props = defineProps<{
	note: Misskey.entities.Note;
	pinned?: boolean;
	mock?: boolean;
	withHardMute?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'reaction', emoji: string): void;
	(ev: 'removeReaction', emoji: string): void;
	(ev: 'expandMute', note: Misskey.entities.Note): void;
}>();

function onExpandNote(note: Misskey.entities.Note) {
	// Expand the user/instance CW for matching subthread (and the inline reply/renote view)
	if (note.id === props.note.id) {
		deepAssign(muteOverrides, {
			user: {
				[note.user.id]: {
					userMandatoryCW: null,
					userSilenced: false,
				},
			},
			instance: {
				[note.user.host ?? '']: {
					instanceMandatoryCW: null,
					instanceSilenced: false,
				},
			},
		});
	}

	emit('expandMute', note);
}
</script>
