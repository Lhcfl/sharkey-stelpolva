<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

Displays a note in the detailed view with either Misskey or Sharkey style, based on user preference.
-->

<template>
<XNoteDetailed
	ref="rootEl"
	:note="note"
	:initialTab="initialTab"
	:expandAllCws="expandAllCws"
	@expandMute="n => onExpandNote(n)"
/>
</template>

<script setup lang="ts">
import * as Misskey from 'misskey-js';
import { defineAsyncComponent, useTemplateRef, watch } from 'vue';
import type { ComponentExposed } from 'vue-component-type-helpers';
import type MkNoteDetailed from '@/components/MkNoteDetailed.vue';
import type SkNoteDetailed from '@/components/SkNoteDetailed.vue';
import { prefer } from '@/preferences';
import { useMuteOverrides } from '@/utility/check-word-mute';
import { deepAssign } from '@/utility/merge';

const XNoteDetailed = defineAsyncComponent(() =>
	prefer.s.noteDesign === 'misskey'
		? import('@/components/MkNoteDetailed.vue')
		: import('@/components/SkNoteDetailed.vue'));

const rootEl = useTemplateRef<ComponentExposed<typeof MkNoteDetailed | typeof SkNoteDetailed>>('rootEl');
const muteOverrides = useMuteOverrides();

defineExpose({ rootEl });

const props = defineProps<{
	note: Misskey.entities.Note;
	initialTab?: string;
	expandAllCws?: boolean;
}>();

// Expand mandatory CWs when "expand all CWs" is clicked
watch(() => props.expandAllCws, () => {
	deepAssign(muteOverrides, {
		all: {
			noteMandatoryCW: null,
			userMandatoryCW: null,
			instanceMandatoryCW: null,
		},
	});
});

const emit = defineEmits<{
	(ev: 'expandMute', note: Misskey.entities.Note): void;
}>();

function onExpandNote(note: Misskey.entities.Note) {
	// Since this is a Detailed note, note.props must point to the top of a thread.
	// Go ahead and expand matching user/instance/thread mutes downstream, since the user is very likely to want them.
	if (note.id === props.note.id) {
		deepAssign(muteOverrides, {
			user: {
				[note.user.id]: {
					userMandatoryCW: null,
					instanceMandatoryCW: null,
				},
			},
			thread: {
				[note.threadId]: {
					threadMuted: false,
				},
			},
		});
	}

	emit('expandMute', note);
}
</script>
