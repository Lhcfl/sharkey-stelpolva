<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only

Simple view of a note in the Sharkey style. Used in quote renotes, link previews, etc.
-->

<template>
<SkMutedNote :note="note" :skipMute="skipMute" :class="$style.root" @expandMute="n => emit('expandMute', n)">
	<MkAvatar :class="$style.avatar" :user="note.user" link preview/>
	<div :class="$style.main">
		<MkNoteHeader :class="$style.header" :classic="true" :note="note" :mini="true"/>
		<div>
			<p v-if="props.note.cw != null" :class="$style.cw">
				<Mfm v-if="props.note.cw != ''" style="margin-right: 8px;" :text="props.note.cw" :isBlock="true" :author="note.user" :nyaize="'respect'" :emojiUrls="note.emojis" @click.stop="prefer.s.clickToOpen ? noteclick(note.id) : undefined"/>
				<MkCwButton v-model="showContent" :text="note.text" :files="note.files" :poll="note.poll" @click.stop/>
			</p>
			<div v-show="props.note.cw == null || showContent">
				<MkSubNoteContent :hideFiles="hideFiles" :class="$style.text" :note="note" :expandAllCws="props.expandAllCws"/>
			</div>
		</div>
	</div>
</SkMutedNote>
</template>

<script lang="ts" setup>
import { watch, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkNoteHeader from '@/components/MkNoteHeader.vue';
import MkSubNoteContent from '@/components/MkSubNoteContent.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import { useRouter } from '@/router';
import { prefer } from '@/preferences.js';
import { setupNoteViewInterruptors } from '@/plugin.js';
import { deepClone } from '@/utility/clone.js';
import SkMutedNote from '@/components/SkMutedNote.vue';

const props = defineProps<{
	note: Misskey.entities.Note & {
		isSchedule?: boolean,
		scheduledNoteId?: string
	};
	expandAllCws?: boolean;
	skipMute?: boolean;
	hideFiles?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'editScheduleNote'): void;
	(ev: 'expandMute', note: Misskey.entities.Note): void;
}>();

let showContent = ref(prefer.s.uncollapseCW);

const note = ref(deepClone(props.note));

setupNoteViewInterruptors(note, null);

watch(() => props.expandAllCws, (expandAllCws) => {
	if (expandAllCws !== showContent.value) showContent.value = expandAllCws;
});

function noteclick(id: string) {
	const selection = window.document.getSelection();
	if (selection?.toString().length === 0) {
		useRouter().push(`/notes/${id}`);
	}
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	margin: 0;
	padding: 0;
	font-size: 0.95em;

	&:hover, &:focus-within {
		background: var(--MI_THEME-panelHighlight);
		transition: background .2s;
	}
}

.avatar {
	flex-shrink: 0;
	display: block;
	margin: 0 10px 0 0;
	width: 34px;
	height: 34px;
	border-radius: var(--MI-radius-sm);
	position: sticky !important;
	top: calc(16px + var(--MI-stickyTop, 0px));
	left: 0;
}

.main {
	flex: 1;
	min-width: 0;
}

.header {
	margin-bottom: 2px;
	z-index: 2;
}

.cw {
	display: block;
	margin: 0;
	padding: 0;
	overflow-wrap: break-word;
	overflow: hidden;
}

.text {
	cursor: default;
	margin: 0;
	padding: 0;
	overflow: hidden;
}

@container (min-width: 250px) {
	.avatar {
		margin: 0 10px 0 0;
		width: 40px;
		height: 40px;
	}
}

@container (min-width: 350px) {
	.avatar {
		margin: 0 10px 0 0;
		width: 44px;
		height: 44px;
	}
}

@container (min-width: 500px) {
	.avatar {
		margin: 0 12px 0 0;
		width: 48px;
		height: 48px;
	}
}
</style>
