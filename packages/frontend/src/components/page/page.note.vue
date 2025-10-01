<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkNote v-if="note && !block.detailed" :key="note.id + ':normal'" :note="note" @expandMute="n => emit('expandMute', n)"/>
	<MkNoteDetailed v-if="note && block.detailed" :key="note.id + ':detail'" :note="note" @expandMute="n => emit('expandMute', n)"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { retryOnThrottled } from '@@/js/retry-on-throttled.js';
import MkNote from '@/components/MkNote.vue';
import MkNoteDetailed from '@/components/MkNoteDetailed.vue';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{
	block: Misskey.entities.PageBlock,
	page: Misskey.entities.Page,
	index: number;
}>();

const emit = defineEmits<{
	(ev: 'expandMute', note: Misskey.entities.Note): void;
}>();

const note = ref<Misskey.entities.Note | null>(null);

// eslint-disable-next-line id-denylist
let timeoutId: ReturnType<typeof window.setTimeout> | null = null;

onMounted(() => {
	if (props.block.note == null) return;
	timeoutId = window.setTimeout(async () => {
		note.value = await retryOnThrottled(() => misskeyApi('notes/show', { noteId: props.block.note }));
	}, 500 * props.index); // rate limit is 2 reqs per sec
});

onUnmounted(() => {
	if (timeoutId !== null) {
		window.clearTimeout(timeoutId);
	}
});
</script>

<style lang="scss" module>
.root {
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
}
</style>
