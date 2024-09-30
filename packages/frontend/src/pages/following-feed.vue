<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader v-model:tab="currentTab" :actions="headerActions" :tabs="headerTabs"/></template>
	<MkHorizontalSwipe v-model:tab="currentTab" :tabs="headerTabs">
		<MkPullToRefresh :refresher="() => reload()">
			<MkSpacer :contentMax="1200">
				<MkPagination ref="pagingComponent" :pagination="pagination">
					<template #empty>
						<div class="_fullinfo">
							<img :src="infoImageUrl" class="_ghost" alt="No notes found" aria-hidden="true"/>
							<div>{{ i18n.ts.noNotes }}</div>
						</div>
					</template>

					<template #default="{ items: notes }">
						<MkDateSeparatedList v-slot="{ item: note }" :items="notes" :class="$style.list" :noGap="true">
							<MkNote :key="note.id" :note="note" :withHardMute="true" :collapseRenote="true" :collapseReplies="true"/>
						</MkDateSeparatedList>
					</template>
				</MkPagination>
			</MkSpacer>
		</MkPullToRefresh>
	</MkHorizontalSwipe>
</MkStickyContainer>
</template>

<script lang="ts">
export type FollowingFeedTab = typeof followingTab | typeof mutualsTab;
export const followingTab = 'following' as const;
export const mutualsTab = 'mutuals' as const;
</script>

<script lang="ts" setup>
import { computed, defineAsyncComponent, ref, shallowRef } from 'vue';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { i18n } from '@/i18n.js';
import MkHorizontalSwipe from '@/components/MkHorizontalSwipe.vue';
import MkPullToRefresh from '@/components/MkPullToRefresh.vue';
import MkPagination, { Paging } from '@/components/MkPagination.vue';
import { infoImageUrl } from '@/instance.js';
import MkDateSeparatedList from '@/components/MkDateSeparatedList.vue';
import { defaultStore } from '@/store.js';
import { Tab } from '@/components/global/MkPageHeader.tabs.vue';
import { PageHeaderItem } from '@/types/page-header.js';

// Load the correct note component
const MkNote = defineAsyncComponent(
	() => defaultStore.state.noteDesign === 'sharkey'
		? import('@/components/SkNote.vue')
		: import('@/components/MkNote.vue'),
);

const props = withDefaults(defineProps<{
	initialTab?: FollowingFeedTab,
}>(), {
	initialTab: followingTab,
});

// Vue complains, but we *want* to lose reactivity here.
// Otherwise the use would be unable to change the tab.
// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const currentTab = ref(props.initialTab);
const mutualsOnly = computed(() => currentTab.value === mutualsTab);

const pagingComponent = shallowRef<InstanceType<typeof MkPagination>>();

async function reload() {
	await pagingComponent.value?.reload();
}

const pagination: Paging<'notes/following'> = {
	endpoint: 'notes/following' as const,
	limit: 20,
	params: computed(() => ({
		mutualsOnly: mutualsOnly.value,
	})),
};

const headerActions: PageHeaderItem[] = [
	{
		icon: 'ti ti-refresh',
		text: i18n.ts.reload,
		handler: () => reload(),
	},
];

const headerTabs = computed(() => [
	{
		key: followingTab,
		icon: 'ti ti-user-check',
		title: i18n.ts.following,
	} satisfies Tab,
	{
		key: mutualsTab,
		icon: 'ti ti-user-heart',
		title: i18n.ts.mutuals,
	} satisfies Tab,
]);

definePageMetadata(() => ({
	title: i18n.ts.following,
	icon: 'ti ti-user-check',
}));

</script>

<style lang="scss" module>
.list {
	background: var(--panel);
}
</style>
