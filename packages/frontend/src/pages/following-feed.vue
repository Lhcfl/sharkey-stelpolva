<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkPageHeader v-model:tab="currentTab" :class="$style.header" :tabs="headerTabs" :actions="headerActions" :displayBackButton="true" @update:tab="onChangeTab"/>

	<div ref="noteScroll" :class="$style.notes">
		<MkHorizontalSwipe v-model:tab="currentTab" :tabs="headerTabs">
			<MkPullToRefresh :refresher="() => reloadLatestNotes()">
				<MkPagination ref="latestNotesPaging" :pagination="latestNotesPagination" @init="onListReady">
					<template #empty>
						<div class="_fullinfo">
							<img :src="infoImageUrl" class="_ghost" :alt="i18n.ts.noNotes" aria-hidden="true"/>
							<div>{{ i18n.ts.noNotes }}</div>
						</div>
					</template>

					<template #default="{ items: notes }">
						<MkDateSeparatedList v-slot="{ item: note }" :items="notes" :class="$style.panel" :noGap="true">
							<FollowingFeedEntry v-if="!isHardMuted(note)" :isMuted="isSoftMuted(note)" :note="note" @select="userSelected"/>
						</MkDateSeparatedList>
					</template>
				</MkPagination>
			</MkPullToRefresh>
		</MkHorizontalSwipe>
	</div>

	<div v-if="isWideViewport" ref="userScroll" :class="$style.user">
		<MkHorizontalSwipe v-if="selectedUserId" v-model:tab="currentTab" :tabs="headerTabs">
			<UserRecentNotes ref="userRecentNotes" :userId="selectedUserId" :withRenotes="withUserRenotes" :withReplies="withUserReplies" :onlyFiles="withOnlyFiles"/>
		</MkHorizontalSwipe>
	</div>
</div>
</template>

<script lang="ts">
export type FollowingFeedTab = typeof followingTab | typeof mutualsTab;
export const followingTab = 'following' as const;
export const mutualsTab = 'mutuals' as const;
</script>

<script lang="ts" setup>
import { computed, Ref, ref, shallowRef } from 'vue';
import * as Misskey from 'misskey-js';
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
import { useRouter } from '@/router/supplier.js';
import * as os from '@/os.js';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import { $i } from '@/account.js';
import { checkWordMute } from '@/scripts/check-word-mute.js';
import UserRecentNotes from '@/components/UserRecentNotes.vue';
import { useScrollPositionManager } from '@/nirax.js';
import { getScrollContainer } from '@/scripts/scroll.js';

const props = withDefaults(defineProps<{
	initialTab?: FollowingFeedTab,
}>(), {
	initialTab: followingTab,
});

const router = useRouter();

// Vue complains, but we *want* to lose reactivity here.
// Otherwise, the user would be unable to change the tab.
// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const currentTab: Ref<FollowingFeedTab> = ref(props.initialTab);
const mutualsOnly: Ref<boolean> = computed(() => currentTab.value === mutualsTab);
const userRecentNotes = shallowRef<InstanceType<typeof UserRecentNotes>>();
const userScroll = shallowRef<HTMLElement>();
const noteScroll = shallowRef<HTMLElement>();

// We have to disable the per-user feed on small displays, and it must be done through JS instead of CSS.
// Otherwise, the second column will waste resources in the background.
const wideViewportQuery = window.matchMedia('(min-width: 750px)');
const isWideViewport: Ref<boolean> = ref(wideViewportQuery.matches);
wideViewportQuery.addEventListener('change', () => isWideViewport.value = wideViewportQuery.matches);

const selectedUserId: Ref<string | null> = ref(null);

function userSelected(user: Misskey.entities.UserLite): void {
	if (isWideViewport.value) {
		selectedUserId.value = user.id;
	} else {
		router.push(`/following-feed/${user.id}`);
	}
}

async function reloadLatestNotes() {
	await latestNotesPaging.value?.reload();
}

async function reloadUserNotes() {
	await userRecentNotes.value?.reload();
}

async function reload() {
	await Promise.all([
		reloadLatestNotes(),
		reloadUserNotes(),
	]);
}

async function onListReady(): Promise<void> {
	if (!selectedUserId.value && latestNotesPaging.value?.items.size) {
		// This just gets the first user ID
		const selectedNote: Misskey.entities.Note = latestNotesPaging.value.items.values().next().value;
		selectedUserId.value = selectedNote.userId;
	}
}

async function onChangeTab(): Promise<void> {
	selectedUserId.value = null;
}

function isSoftMuted(note: Misskey.entities.Note): boolean {
	return isMuted(note, $i?.mutedWords);
}

function isHardMuted(note: Misskey.entities.Note): boolean {
	return isMuted(note, $i?.hardMutedWords);
}

// Match the typing used by Misskey
type Mutes = (string | string[])[] | null | undefined;

// Adapted from MkNote.ts
function isMuted(note: Misskey.entities.Note, mutes: Mutes): boolean {
	return checkMute(note, mutes)
		|| checkMute(note.reply, mutes)
		|| checkMute(note.renote, mutes);
}

// Adapted from check-word-mute.ts
function checkMute(note: Misskey.entities.Note | undefined | null, mutes: Mutes): boolean {
	if (!note) {
		return false;
	}

	if (!mutes || mutes.length < 1) {
		return false;
	}

	return checkWordMute(note, $i, mutes);
}

const latestNotesPaging = shallowRef<InstanceType<typeof MkPagination>>();

const latestNotesPagination: Paging<'notes/following'> = {
	endpoint: 'notes/following' as const,
	limit: 20,
	params: computed(() => ({
		mutualsOnly: mutualsOnly.value,
	})),
};

const withUserRenotes = ref(false);
const withUserReplies = ref(true);
const withOnlyFiles = ref(false);

const headerActions = computed(() => {
	const actions: PageHeaderItem[] = [
		{
			icon: 'ti ti-refresh',
			text: i18n.ts.reload,
			handler: () => reload(),
		},
	];

	if (isWideViewport.value) {
		actions.push({
			icon: 'ti ti-dots',
			text: i18n.ts.options,
			handler: (ev) => {
				os.popupMenu([
					{
						type: 'switch',
						text: i18n.ts.showRenotes,
						ref: withUserRenotes,
					}, {
						type: 'switch',
						text: i18n.ts.showRepliesToOthersInTimeline,
						ref: withUserReplies,
						disabled: withOnlyFiles,
					},
					{
						type: 'divider',
					},
					{
						type: 'switch',
						text: i18n.ts.fileAttachedOnly,
						ref: withOnlyFiles,
						disabled: withUserReplies,
					},
				], ev.currentTarget ?? ev.target);
			},
		});
	}

	return actions;
});

const headerTabs = computed(() => [
	{
		key: followingTab,
		icon: 'ph-user-check ph-bold ph-lg',
		title: i18n.ts.following,
	} satisfies Tab,
	{
		key: mutualsTab,
		icon: 'ph-user-switch ph-bold ph-lg',
		title: i18n.ts.mutuals,
	} satisfies Tab,
]);

useScrollPositionManager(() => getScrollContainer(userScroll.value ?? null), router);
useScrollPositionManager(() => getScrollContainer(noteScroll.value ?? null), router);
definePageMetadata(() => ({
	title: i18n.ts.following,
	icon: 'ph-user-check ph-bold ph-lg',
}));

</script>

<style lang="scss" module>
//This inspection complains about duplicate "height" properties, but this is needed because "dvh" units are not supported in all browsers.
//The earlier "vh" provide a "close enough" approximation for older browsers.
//noinspection CssOverwrittenProperties
.root {
	display: grid;
	grid-template-columns: min-content 1fr min-content;
	grid-template-rows: min-content 1fr;
	grid-template-areas:
		"header header header"
		"lm notes rm";
	gap: 12px;

	height: 100vh;
	height: 100dvh;

	// The universal layout inserts a "spacer" thing that causes a stray scroll bar.
	// We have to create fake "space" for it to "roll up" and back into the viewport, which removes the scrollbar.
	margin-bottom: calc(-1 * var(--minBottomSpacing));

	// Some "just in case" backup properties.
	// These should not be needed, but help to maintain the layout if the above trick ever stops working.
	overflow: hidden;
	position: sticky;
	top: 0;
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

.userInfo {
	margin-bottom: 12px;
}

@media (min-width: 750px) {
	.root {
		grid-template-columns: min-content 4fr 6fr min-content;
		grid-template-rows: min-content 1fr;
		grid-template-areas:
			"header header header header"
			"lm notes user rm";
		gap: 24px;
	}

	.userInfo {
		margin-bottom: 24px;
	}
}

.panel {
	background: var(--panel);
}
</style>
