<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.header">
		<MkPageHeader v-model:tab="userList" :tabs="headerTabs" :actions="headerActions" :displayBackButton="true" @update:tab="onChangeTab"/>
		<MkInfo v-if="showRemoteWarning" :class="$style.remoteWarning" warn closable @close="remoteWarningDismissed = true">{{ i18n.ts.remoteFollowersWarning }}</MkInfo>
	</div>

	<div ref="noteScroll" :class="$style.notes">
		<MkHorizontalSwipe v-model:tab="userList" :tabs="headerTabs">
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
							<SkFollowingFeedEntry v-if="!isHardMuted(note)" :isMuted="isSoftMuted(note)" :note="note" @select="userSelected"/>
						</MkDateSeparatedList>
					</template>
				</MkPagination>
			</MkPullToRefresh>
		</MkHorizontalSwipe>
	</div>

	<div v-if="isWideViewport" ref="userScroll" :class="$style.user">
		<MkHorizontalSwipe v-if="selectedUserId" v-model:tab="userList" :tabs="headerTabs">
			<SkUserRecentNotes ref="userRecentNotes" :userId="selectedUserId" :withNonPublic="withNonPublic" :withQuotes="withQuotes" :withBots="withBots" :withReplies="withReplies" :onlyFiles="onlyFiles"/>
		</MkHorizontalSwipe>
	</div>
</div>
</template>

<script lang="ts">
export const followingTab = 'following' as const;
export const mutualsTab = 'mutuals' as const;
export const followersTab = 'followers' as const;
export type FollowingFeedTab = typeof followingTab | typeof mutualsTab | typeof followersTab;
</script>

<script lang="ts" setup>
import { computed, Ref, ref, shallowRef } from 'vue';
import * as Misskey from 'misskey-js';
import { getScrollContainer } from '@@/js/scroll.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { i18n } from '@/i18n.js';
import MkHorizontalSwipe from '@/components/MkHorizontalSwipe.vue';
import MkPullToRefresh from '@/components/MkPullToRefresh.vue';
import { infoImageUrl } from '@/instance.js';
import MkDateSeparatedList from '@/components/MkDateSeparatedList.vue';
import { Tab } from '@/components/global/MkPageHeader.tabs.vue';
import { PageHeaderItem } from '@/types/page-header.js';
import SkFollowingFeedEntry from '@/components/SkFollowingFeedEntry.vue';
import { useRouter } from '@/router/supplier.js';
import * as os from '@/os.js';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import { $i } from '@/account.js';
import { checkWordMute } from '@/scripts/check-word-mute.js';
import SkUserRecentNotes from '@/components/SkUserRecentNotes.vue';
import { useScrollPositionManager } from '@/nirax.js';
import { defaultStore } from '@/store.js';
import { deepMerge } from '@/scripts/merge.js';
import MkPagination, { Paging } from '@/components/MkPagination.vue';
import MkInfo from '@/components/MkInfo.vue';

const withNonPublic = computed({
	get: () => {
		if (userList.value === 'followers') return false;
		return defaultStore.reactiveState.followingFeed.value.withNonPublic;
	},
	set: value => saveFollowingFilter('withNonPublic', value),
});
const withQuotes = computed({
	get: () => defaultStore.reactiveState.followingFeed.value.withQuotes,
	set: value => saveFollowingFilter('withQuotes', value),
});
const withBots = computed({
	get: () => defaultStore.reactiveState.followingFeed.value.withBots,
	set: value => saveFollowingFilter('withBots', value),
});
const withReplies = computed({
	get: () => defaultStore.reactiveState.followingFeed.value.withReplies,
	set: value => saveFollowingFilter('withReplies', value),
});
const onlyFiles = computed({
	get: () => defaultStore.reactiveState.followingFeed.value.onlyFiles,
	set: value => saveFollowingFilter('onlyFiles', value),
});
const userList = computed({
	get: () => defaultStore.reactiveState.followingFeed.value.userList,
	set: value => saveFollowingFilter('userList', value),
});
const remoteWarningDismissed = computed({
	get: () => defaultStore.reactiveState.followingFeed.value.remoteWarningDismissed,
	set: value => saveFollowingFilter('remoteWarningDismissed', value),
});

// Based on timeline.saveTlFilter()
function saveFollowingFilter<Key extends keyof typeof defaultStore.state.followingFeed>(key: Key, value: (typeof defaultStore.state.followingFeed)[Key]) {
	const out = deepMerge({ [key]: value }, defaultStore.state.followingFeed);
	defaultStore.set('followingFeed', out);
}

const router = useRouter();

const userRecentNotes = shallowRef<InstanceType<typeof SkUserRecentNotes>>();
const userScroll = shallowRef<HTMLElement>();
const noteScroll = shallowRef<HTMLElement>();

const showRemoteWarning = computed(() => userList.value === 'followers' && !remoteWarningDismissed.value);

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
		// This looks messy, but actually just gets the first user ID.
		const selectedNote = latestNotesPaging.value.items.values().next().value;

		// We know this to be non-null because of the size check above.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		selectedUserId.value = selectedNote!.userId;
	}
}

async function onChangeTab(): Promise<void> {
	selectedUserId.value = null;
}

function isSoftMuted(note: Misskey.entities.Note): boolean {
	if (defaultStore.state.stpvClientMutedNotes.includes(note.id)) { return true; }
	if (note.replyId && defaultStore.state.stpvClientMutedNotes.includes(note.replyId)) { return true; }
	if (note.renoteId && defaultStore.state.stpvClientMutedNotes.includes(note.renoteId)) { return true; }
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
		list: userList.value,
		filesOnly: onlyFiles.value,
		includeNonPublic: withNonPublic.value,
		includeReplies: withReplies.value,
		includeQuotes: withQuotes.value,
		includeBots: withBots.value,
	})),
};

const headerActions: PageHeaderItem[] = [
	{
		icon: 'ti ti-refresh',
		text: i18n.ts.reload,
		handler: () => reload(),
	},
	{
		icon: 'ti ti-dots',
		text: i18n.ts.options,
		handler: (ev) => {
			os.popupMenu([
				{
					type: 'switch',
					text: i18n.ts.showNonPublicNotes,
					ref: withNonPublic,
					disabled: userList.value === 'followers',
				},
				{
					type: 'switch',
					text: i18n.ts.showQuotes,
					ref: withQuotes,
				},
				{
					type: 'switch',
					text: i18n.ts.showBots,
					ref: withBots,
				},
				{
					type: 'switch',
					text: i18n.ts.showReplies,
					ref: withReplies,
					disabled: onlyFiles,
				},
				{
					type: 'divider',
				},
				{
					type: 'switch',
					text: i18n.ts.fileAttachedOnly,
					ref: onlyFiles,
					disabled: withReplies,
				},
			], ev.currentTarget ?? ev.target);
		},
	},
];

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
	{
		key: followersTab,
		icon: 'ph-user ph-bold ph-lg',
		title: i18n.ts.followers,
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

.remoteWarning {
	margin: 12px 12px 0 12px;
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

	.remoteWarning {
		margin: 24px 24px 0 24px;
	}

	.userInfo {
		margin-bottom: 24px;
	}
}

.panel {
	background: var(--panel);
}
</style>
