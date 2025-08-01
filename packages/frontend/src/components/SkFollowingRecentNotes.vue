<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

List that displays the most recent note from each followed user, in order, with date separators.
-->

<template>
<MkPullToRefresh :refresher="() => reload()">
	<MkPagination ref="latestNotesPaging" :pagination="latestNotesPagination" @init="onListReady">
		<template #empty><MkResult type="empty" :text="i18n.ts.noNotes"/></template>

		<template #default="{ items: notes }">
			<!-- TODO replace with SkDateSeparatedList when merged -->
			<MkDateSeparatedList v-slot="{ item: note }" :items="notes" :class="$style.panel" :noGap="true">
				<SkFollowingFeedEntry :note="note" :class="props.selectedUserId == note.userId && $style.selected" @select="u => selectUser(u.id)"/>
			</MkDateSeparatedList>
		</template>
	</MkPagination>
</MkPullToRefresh>
</template>

<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import type { Paging } from '@/components/MkPagination.vue';
import type { FollowingFeedTab } from '@/types/following-feed.js';
import { i18n } from '@/i18n.js';
import MkDateSeparatedList from '@/components/MkDateSeparatedList.vue';
import MkPagination from '@/components/MkPagination.vue';
import SkFollowingFeedEntry from '@/components/SkFollowingFeedEntry.vue';
import MkPullToRefresh from '@/components/MkPullToRefresh.vue';
import { store } from '@/store';

const props = defineProps<{
	userList: FollowingFeedTab;
	withNonPublic: boolean;
	withQuotes: boolean;
	withReplies: boolean;
	withBots: boolean;
	onlyFiles: boolean;
	selectedUserId?: string | null;
}>();

const emit = defineEmits<{
	(event: 'loaded', initialUserId?: string): void;
	(event: 'userSelected', userId: string): void;
}>();

defineExpose({ reload });

async function reload() {
	await latestNotesPaging.value?.reload();
}

function selectUser(userId: string) {
	emit('userSelected', userId);
}

async function onListReady(): Promise<void> {
	// This looks complicated, but it's really just a trick to get the first user ID from the pagination.
	const initialUserId = latestNotesPaging.value?.items.size
		? latestNotesPaging.value.items.values().next().value?.userId
		: undefined;

	emit('loaded', initialUserId);
}

const latestNotesPagination: Paging<'notes/following'> = {
	endpoint: 'notes/following' as const,
	limit: 20,
	params: computed(() => ({
		list: props.userList,
		filesOnly: props.onlyFiles,
		includeNonPublic: props.withNonPublic,
		includeReplies: props.withReplies,
		includeQuotes: props.withQuotes,
		includeBots: props.withBots,
	})),
};

const latestNotesPaging = shallowRef<InstanceType<typeof MkPagination>>();
</script>

<style module lang="scss">
.panel {
	background: var(--MI_THEME-panel);
}

@keyframes border {
	from {
		border-left: 0 solid var(--MI_THEME-accent);
	}
	to {
		border-left: 6px solid var(--MI_THEME-accent);
	}
}

.selected {
	animation: border 0.2s ease-out 0s 1 forwards;

	&:first-child {
		border-top-left-radius: 5px;
	}

	&:last-child {
		border-bottom-left-radius: 5px;
	}
}
</style>
