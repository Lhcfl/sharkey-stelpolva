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
/>
</template>

<script setup lang="ts">
import * as Misskey from 'misskey-js';
import { computed, defineAsyncComponent, useTemplateRef } from 'vue';
import type { ComponentExposed } from 'vue-component-type-helpers';
import type MkNoteDetailed from '@/components/MkNoteDetailed.vue';
import type SkNoteDetailed from '@/components/SkNoteDetailed.vue';
import { prefer } from '@/preferences';

const XNoteDetailed = defineAsyncComponent(() =>
	prefer.s.noteDesign === 'misskey'
	? import('@/components/MkNoteDetailed.vue')
	: import('@/components/SkNoteDetailed.vue'),
);

const rootEl = useTemplateRef<ComponentExposed<typeof MkNoteDetailed | typeof SkNoteDetailed>>('rootEl');

defineExpose({ rootEl });

defineProps<{
	note: Misskey.entities.Note;
	initialTab?: string;
	expandAllCws?: boolean;
}>();
</script>
