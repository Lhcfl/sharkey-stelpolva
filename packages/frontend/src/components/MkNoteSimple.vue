<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="!isDeleted" :class="$style.root">
	<MkAvatar :class="$style.avatar" :user="note.user" link preview/>
	<div :class="$style.main">
		<MkNoteHeader :class="$style.header" :note="note" :mini="true"/>
		<div>
			<p v-if="mergedCW != null" :class="$style.cw">
				<Mfm v-if="mergedCW != ''" style="margin-right: 8px;" :text="mergedCW" :isBlock="true" :author="note.user" :nyaize="'respect'" :emojiUrls="note.emojis"/>
				<MkCwButton v-model="showContent" :text="note.text" :files="note.files" :poll="note.poll" @click.stop/>
			</p>
			<div v-show="mergedCW == null || showContent">
				<MkSubNoteContent :hideFiles="hideFiles" :class="$style.text" :note="note" :expandAllCws="props.expandAllCws"/>
				<div v-if="note.isSchedule" style="margin-top: 10px;">
					<MkButton :class="$style.button" inline @click.stop.prevent="editScheduleNote()"><i class="ti ti-eraser"></i> {{ i18n.ts.edit }}</MkButton>
					<MkButton :class="$style.button" inline danger @click.stop.prevent="deleteScheduleNote()"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
				</div>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { computeMergedCw } from '@@/js/compute-merged-cw.js';
import * as os from '@/os.js';
import MkNoteHeader from '@/components/MkNoteHeader.vue';
import MkSubNoteContent from '@/components/MkSubNoteContent.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	note: Misskey.entities.Note & {
		isSchedule?: boolean,
		scheduledNoteId?: string
	};
	expandAllCws?: boolean;
	hideFiles?: boolean;
}>();

const showContent = ref(prefer.s.uncollapseCW);
const isDeleted = ref(false);

const mergedCW = computed(() => computeMergedCw(props.note));

const emit = defineEmits<{
	(ev: 'editScheduleNote'): void;
}>();

async function deleteScheduleNote() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.deleteConfirm,
		okText: i18n.ts.delete,
		cancelText: i18n.ts.cancel,
	});
	if (canceled) return;
	await os.apiWithDialog('notes/schedule/delete', { noteId: props.note.id })
		.then(() => {
			isDeleted.value = true;
		});
}

async function editScheduleNote() {
	await os.apiWithDialog('notes/schedule/delete', { noteId: props.note.id })
		.then(() => {
			isDeleted.value = true;
		});

	await os.post({
		initialNote: props.note,
		renote: props.note.renote,
		reply: props.note.reply,
		channel: props.note.channel,
	});
	emit('editScheduleNote');
}

watch(() => props.expandAllCws, (expandAllCws) => {
	if (expandAllCws !== showContent.value) showContent.value = expandAllCws;
});
</script>

<style lang="scss" module>
.root {
	display: flex;
	margin: 0;
	padding: 0;
	font-size: 0.95em;
}

.button{
	margin-right: var(--MI-margin);
	margin-bottom: var(--MI-margin);
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
