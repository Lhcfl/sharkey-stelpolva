<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.header">
		<MkPageHeader v-model:tab="userList" :tabs="headerTabs" :actions="headerActions" :displayBackButton="true" @update:tab="onChangeTab"/>
		<SkRemoteFollowersWarning :class="$style.remoteWarning" :model="model"/>
	</div>

	<div ref="noteScroll" :class="$style.notes">
		<MkSwiper v-model:tab="userList" :tabs="headerTabs">
			<SkFollowingRecentNotes ref="followingRecentNotes" :selectedUserId="selectedUserId" :userList="userList" :withNonPublic="withNonPublic" :withQuotes="withQuotes" :withBots="withBots" :withReplies="withReplies" :onlyFiles="onlyFiles" @userSelected="userSelected" @loaded="listReady"/>
		</MkSwiper>
	</div>

	<MkLazy ref="userScroll" :class="$style.user">
		<MkSwiper v-if="selectedUserId" v-model:tab="userList" :tabs="headerTabs">
			<SkUserRecentNotes ref="userRecentNotes" :userId="selectedUserId" :withNonPublic="withNonPublic" :withQuotes="withQuotes" :withBots="withBots" :withReplies="withReplies" :onlyFiles="onlyFiles"/>
		</MkSwiper>
	</MkLazy>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import type { Tab } from '@/components/global/MkPageHeader.tabs.vue';
import type { PageHeaderItem } from '@/types/page-header.js';
import { i18n } from '@/i18n.js';
import MkSwiper from '@/components/MkSwiper.vue';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import SkUserRecentNotes from '@/components/SkUserRecentNotes.vue';
import { createModel, createHeaderItem, followingTabIcon, followingTabName } from '@/utility/following-feed-utils.js';
import { followingTab, followingFeedTabs } from '@/types/following-feed.js';
import SkFollowingRecentNotes from '@/components/SkFollowingRecentNotes.vue';
import SkRemoteFollowersWarning from '@/components/SkRemoteFollowersWarning.vue';
import { useRouter } from '@/router.js';
import { definePage } from '@/page.js';
import MkLazy from '@/components/global/MkLazy.vue';
import { useScrollPositionKeeper } from '@/use/use-scroll-position-keeper.js';

const model = createModel();
const {
	userList,
	withNonPublic,
	withQuotes,
	withBots,
	withReplies,
	onlyFiles,
} = model;

const router = useRouter();

const userRecentNotes = useTemplateRef('userRecentNotes');
const followingRecentNotes = useTemplateRef('followingRecentNotes');
const userScroll = useTemplateRef('userScroll');
const noteScroll = useTemplateRef('noteScroll');

const selectedUserId: Ref<string | null> = ref(null);

function listReady(initialUserId?: string): void {
	if (initialUserId && !selectedUserId.value) {
		selectedUserId.value = initialUserId;
	}
}

function userSelected(userId: string): void {
	selectedUserId.value = userId;

	if (!userScroll.value?.showing) {
		router.push(`/following-feed/${userId}`);
	}
}

async function reload() {
	await Promise.all([
		followingRecentNotes.value?.reload(),
		userRecentNotes.value?.reload(),
	]);
}

async function onChangeTab(): Promise<void> {
	selectedUserId.value = null;
}

const headerActions: PageHeaderItem[] = [
	{
		icon: 'ti ti-refresh',
		text: i18n.ts.reload,
		handler: () => reload(),
	},
	createHeaderItem(),
];

const headerTabs: ComputedRef<Tab[]> = computed(() => followingFeedTabs.map(t => ({
	key: t,
	icon: followingTabIcon(t),
	title: followingTabName(t),
})));

useScrollPositionKeeper(computed(() => userScroll.value?.rootEl));
useScrollPositionKeeper(computed(() => noteScroll.value));
definePage(() => ({
	title: i18n.ts.following,
	icon: followingTabIcon(followingTab),
}));

</script>

<style lang="scss" module>
.root {
	display: grid;
	grid-template-columns: min-content 1fr min-content;
	grid-template-rows: min-content 1fr;
	grid-template-areas:
		"header header header"
		"lm notes rm";
	gap: 12px;

	height: 100%;
}

.header {
	grid-area: header;
}

.notes {
	grid-area: notes;
	overflow-y: auto;
}

.user {
	grid-area: user;
	overflow-y: auto;
}

.remoteWarning {
	margin: 12px 12px 0 12px;
}

.userInfo {
	margin-bottom: 12px;
}

@container (max-width: 749px) {
	.user {
		display: none;
	}
}

@container (min-width: 750px) {
	.root {
		grid-template-columns: min-content 4fr 6fr min-content;
		grid-template-rows: min-content 1fr;
		grid-template-areas:
			"header header header header"
			"lm notes user rm";
		gap: 24px;
	}

	.remoteWarning {
		margin: 24px 24px 0 24px;
	}

	.userInfo {
		margin-bottom: 24px;
	}
}
</style>
