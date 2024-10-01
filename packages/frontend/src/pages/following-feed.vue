<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader v-model:tab="currentTab" :actions="headerActions" :tabs="headerTabs"/></template>
	<MkHorizontalSwipe v-model:tab="currentTab" :tabs="headerTabs">
		<MkSpacer :contentMax="1200">
			<div :class="$style.columns">
				<MkPullToRefresh :refresher="() => reloadList()">
					<MkPagination ref="listPaging" :pagination="listPagination">
						<template #empty>
							<div class="_fullinfo">
								<img :src="infoImageUrl" class="_ghost" alt="No notes found" aria-hidden="true"/>
								<div>{{ i18n.ts.noNotes }}</div>
							</div>
						</template>

						<template #default="{ items: notes }">
							<MkDateSeparatedList v-slot="{ item: note }" :items="notes" :class="$style.list" :noGap="true">
								<FollowingFeedEntry :note="note" @select="selectUser"/>
							</MkDateSeparatedList>
						</template>
					</MkPagination>
				</MkPullToRefresh>

				<MkPullToRefresh v-if="selectedUserId" :refresher="() => reloadUser()">
					<MkNotes :noGap="true" :pagination="userPagination" :paginationComponent="userPaging"/>
				</MkPullToRefresh>
			</div>
		</MkSpacer>
	</MkHorizontalSwipe>
</MkStickyContainer>
</template>

<script lang="ts">
export type FollowingFeedTab = typeof followingTab | typeof mutualsTab;
export const followingTab = 'following' as const;
export const mutualsTab = 'mutuals' as const;
</script>

<script lang="ts" setup>
import { computed, ref, shallowRef } from 'vue';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { i18n } from '@/i18n.js';
import MkHorizontalSwipe from '@/components/MkHorizontalSwipe.vue';
import MkPullToRefresh from '@/components/MkPullToRefresh.vue';
import MkPagination, { Paging } from '@/components/MkPagination.vue';
import { infoImageUrl } from '@/instance.js';
import MkDateSeparatedList from '@/components/MkDateSeparatedList.vue';
import { Tab } from '@/components/global/MkPageHeader.tabs.vue';
import { PageHeaderItem } from '@/types/page-header.js';
import FollowingFeedEntry from '@/components/FollowingFeedEntry.vue';
import MkNotes from '@/components/MkNotes.vue';

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

const selectedUserId = ref('');

function selectUser(userId: string): void {
	selectedUserId.value = userId;
	console.log('userId', userId);
}

const listPaging = shallowRef<InstanceType<typeof MkPagination>>();
const userPaging = shallowRef<InstanceType<typeof MkPagination>>();

async function reloadList() {
	await listPaging.value?.reload();
}

async function reloadUser() {
	await userPaging.value?.reload();
}

async function reloadBoth() {
	await Promise.all([
		reloadList(),
		reloadUser(),
	]);
}

const listPagination: Paging<'notes/following'> = {
	endpoint: 'notes/following' as const,
	limit: 20,
	params: computed(() => ({
		mutualsOnly: mutualsOnly.value,
	})),
};

const userPagination: Paging<'users/notes'> = {
	endpoint: 'users/notes' as const,
	limit: 10,
	params: computed(() => ({
		userId: selectedUserId.value,
		withRenotes: false,
		withReplies: true,
		withChannelNotes: false,
		withFiles: false,
	})),
};

const headerActions: PageHeaderItem[] = [
	{
		icon: 'ti ti-refresh',
		text: i18n.ts.reload,
		handler: () => reloadBoth(),
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

.columns {
	display: flex;
	flex-direction: row;

	width: 100%;
}

.columns > * {
	flex: 1;
}

.columns > :last-child {
	min-width: 60%;
}

.columns > :not(:first-child) {
	margin-left: 6px;
}

.columns > :not(:last-child) {
	margin-right: 6px;
}

@container (min-width: 451px) {
	.columns > :not(:first-child) {
		margin-left: 12px;
	}

	.columns > :not(:last-child) {
		margin-right: 12px;
	}
}
</style>
