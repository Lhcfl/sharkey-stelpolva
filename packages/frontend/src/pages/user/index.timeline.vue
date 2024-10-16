<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header>
		<MkPageHeader v-model:tab="tab" :class="$style.tab" :actions="headerActions" :tabs="headerTabs" hideTitle/>
	</template>
	<MkNotes :noGap="true" :pagination="pagination" :class="$style.tl"/>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkNotes from '@/components/MkNotes.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const props = defineProps<{
	user: Misskey.entities.UserDetailed;
}>();

const tab = ref<string | null>('all');

const timetraveled = ref<Date>();
const withRenotes = ref(true);
const onlyFiles = ref(false);
const withReplies = ref(true);
const withRepliesToSelf = ref(true);
const withChannelNotes = ref(true);
const withNonPublic = ref(true);
const withQuotes = ref(true);

const pagination = computed(() => tab.value === 'featured' ? {
	endpoint: 'users/featured-notes' as const,
	limit: 10,
	params: {
		userId: props.user.id,
	},
} : {
	endpoint: 'users/notes' as const,
	limit: 10,
	params: {
		userId: props.user.id,
		withRenotes: withRenotes.value,
		withReplies: withReplies.value,
		withRepliesToSelf: withRepliesToSelf.value,
		withNonPublic: withNonPublic.value,
		withQuotes: withQuotes.value,
		withChannelNotes: withChannelNotes.value,
		withFiles: onlyFiles.value,
		untilDate: timetraveled.value ? Number(timetraveled.value) : undefined,
	},
});

async function timetravel(): Promise<void> {
	const { canceled, result: date } = await os.inputDate({
		title: i18n.ts.timeTravel as string,
		text: i18n.ts.timeTravelDescription as string,
	});
	if (canceled) return;
	timetraveled.value = date;
}

watch(withReplies, (nv) => {
	if (nv && onlyFiles.value) {
		onlyFiles.value = false;
	}
});
watch(onlyFiles, (nv) => {
	if (withReplies.value && nv) {
		withReplies.value = false;
	}
});

const headerActions = computed(() => [
	{
		icon: 'ti ti-dots',
		text: i18n.ts.options,
		handler: (ev) => {
			os.popupMenu([
				{
					type: 'switch',
					text: 'With replies to others',
					ref: withReplies,
				}, {
					type: 'switch',
					text: 'With replies to self',
					ref: withRepliesToSelf,
				}, {
					type: 'switch',
					text: 'With quotes',
					ref: withQuotes,
				}, {
					type: 'switch',
					text: 'With non-public',
					ref: withNonPublic,
				}, {
					type: 'switch',
					text: i18n.ts.showRenotes,
					ref: withRenotes,
				}, {
					type: 'switch',
					text: i18n.ts.channel,
					ref: withChannelNotes,
				}, {
					type: 'switch',
					text: i18n.ts.fileAttachedOnly,
					ref: onlyFiles,
				}, {
					type: 'divider',
				}, {
					type: 'button',
					text: i18n.ts.timeTravel,
					icon: 'ti ti-calendar-time',
					action: () => {
						timetravel();
					},
				}], ev.currentTarget ?? ev.target);
		},
	},
]);
const headerTabs = computed(() => [
	{
		key: 'featured',
		title: i18n.ts.featured,
		icon: 'ph-lightbulb ph-bold ph-lg',
	},
	{
		key: 'all',
		title: i18n.ts.notes,
		icon: 'ph-pencil-simple ph-bold ph-lg',
	},
]);

</script>

<style lang="scss" module>
.tab {
	// padding: calc(var(--margin) / 2) 0;
	// background: var(--bg);
}

.tl {
	background: var(--bg);
	border-radius: var(--radius);
	overflow: clip;
}
</style>
