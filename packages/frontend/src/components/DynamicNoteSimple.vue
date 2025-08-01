<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

Displays a note in the simple view with either Misskey or Sharkey style, based on user preference.
-->

<template>
<XNoteSimple
	ref="rootEl"
	:note="note"
	:expandAllCws="expandAllCws"
	:hideFiles="hideFiles"
	@editScheduledNote="() => emit('editScheduleNote')"
/>
</template>

<script setup lang="ts">
import * as Misskey from 'misskey-js';
import { computed, defineAsyncComponent, useTemplateRef } from 'vue';
import type { ComponentExposed } from 'vue-component-type-helpers';
import type MkNoteSimple from '@/components/MkNoteSimple.vue';
import type SkNoteSimple from '@/components/SkNoteSimple.vue';
import { prefer } from '@/preferences';

const XNoteSimple = defineAsyncComponent(() =>
	prefer.s.noteDesign === 'misskey'
	? import('@/components/MkNoteSimple.vue')
	: import('@/components/SkNoteSimple.vue'),
);

const rootEl = useTemplateRef<ComponentExposed<typeof MkNoteSimple | typeof SkNoteSimple>>('rootEl');

defineExpose({ rootEl });

defineProps<{
	note: Misskey.entities.Note & {
		isSchedule?: boolean,
		scheduledNoteId?: string
	};
	expandAllCws?: boolean;
	hideFiles?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'editScheduleNote'): void;
}>();
</script>
