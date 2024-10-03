<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkPageHeader v-model:tab="currentTab" :class="$style.header" :tabs="headerTabs" :actions="headerActions" @update:tab="onChangeTab"/>

	<div :class="$style.notes">
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

	<div v-if="isWideViewport" :class="$style.user">
		<MkHorizontalSwipe v-model:tab="currentTab" :tabs="headerTabs">
			<MkPullToRefresh :refresher="() => reloadUserNotes()">
				<div v-if="selectedUser" :class="$style.userInfo">
					<MkUserInfo :class="$style.userInfo" class="user" :user="selectedUser"/>
					<MkNotes :noGap="true" :pagination="userNotesPagination"/>
				</div>
				<div v-else-if="selectedUserError" :class="$style.panel">{{ selectedUserError }}</div>
				<MkLoading v-else-if="selectedUserId"/>
			</MkPullToRefresh>
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
import MkNotes from '@/components/MkNotes.vue';
import MkUserInfo from '@/components/MkUserInfo.vue';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { useRouter } from '@/router/supplier.js';
import * as os from '@/os.js';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import { $i } from '@/account.js';
import MkLoading from '@/components/global/MkLoading.vue';
import { getNoteText } from '@/scripts/check-word-mute.js';

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

// We have to disable the per-user feed on small displays, and it must be done through JS instead of CSS.
// Otherwise, the second column will waste resources in the background.
const wideViewportQuery = window.matchMedia('(min-width: 750px)');
const isWideViewport: Ref<boolean> = ref(wideViewportQuery.matches);
wideViewportQuery.addEventListener('change', () => isWideViewport.value = wideViewportQuery.matches);

const selectedUserError: Ref<string> = ref('');
const selectedUserId: Ref<string> = ref('');
const selectedUser: Ref<Misskey.entities.UserDetailed | null> = ref(null);

async function userSelected(user: Misskey.entities.UserLite): Promise<void> {
	if (isWideViewport.value) {
		await showUserNotes(user.id);
	} else {
		if (user.host) {
			router.push(`/@${user.username}@${user.host}`);
		} else {
			router.push(`/@${user.username}`);
		}
	}
}

async function showUserNotes(userId: string): Promise<void> {
	selectedUserError.value = '';
	selectedUserId.value = userId;
	selectedUser.value = null;

	if (userId) {
		// Wait for 1 second to match the animation effects in MkHorizontalSwipe, MkPullToRefresh, and MkPagination.
		// Otherwise, the page appears to load "backwards".
		await new Promise(resolve => setTimeout(resolve, 1000));

		// We need a User entity, but the pagination returns only UserLite.
		// An additional request is needed to "upgrade" the object.
		await misskeyApi('users/show', { userId })
			.then(user => selectedUser.value = user)
			.catch(error => {
				console.error('Error fetching user info', error);

				return selectedUserError.value =
					typeof(error) === 'string'
						? String(error)
						: JSON.stringify(error);
			});
	}
}

async function reloadLatestNotes() {
	await latestNotesPaging.value?.reload();
}

async function reloadUserNotes() {
	await showUserNotes(selectedUserId.value);
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
		await showUserNotes(selectedNote.userId);
	}
}

async function onChangeTab(): Promise<void> {
	await showUserNotes('');
}

const softMutePatterns = ref(buildMutePatterns($i?.mutedWords));
const hardMutePatterns = ref(buildMutePatterns($i?.hardMutedWords));

function buildMutePatterns(mutedWords: (string | string[])[] | undefined): RegExp[] {
	if (!mutedWords || mutedWords.length < 1) {
		return [];
	}

	// flags -> pattern[]
	const patternMap = new Map<string, Set<string>>();
	for (const mute of mutedWords) {
		let flags: string;
		let patterns: string[];

		if (!mute) {
			continue;
		} else if (Array.isArray(mute)) {
			patterns = mute;
			flags = 'i';
		} else {
			const match = mute.match(/^\/(.+)\/(.*)$/);
			if (!match) {
				continue;
			} else {
				patterns = [match[1]];
				flags = match[2];
			}
		}

		let flagPatterns = patternMap.get(flags);
		if (!flagPatterns) {
			flagPatterns = new Set<string>();
			patternMap.set(flags, flagPatterns);
		}

		for (const pattern of patterns) {
			flagPatterns.add(pattern);
		}
	}

	return Array
		.from(patternMap)
		.map(([flag, patterns]) => {
			const pattern = Array.from(patterns).map(p => `(${p})`).join('|');
			return new RegExp(pattern, flag);
		});
}

// Adapted from MkNote.ts
function isSoftMuted(note: Misskey.entities.Note): boolean {
	return isMuted(note, softMutePatterns.value);
}

function isHardMuted(note: Misskey.entities.Note): boolean {
	return isMuted(note, hardMutePatterns.value);
}

function isMuted(note: Misskey.entities.Note, mutes: RegExp[]): boolean {
	if (mutes.length < 1) return false;

	return checkMute(note, mutes)
		|| checkMute(note.reply, mutes)
		|| checkMute(note.renote, mutes);
}

// Adapted from check-word-mute.ts
function checkMute(note: Misskey.entities.Note | undefined | null, mutes: RegExp[]): boolean {
	if (!note) {
		return false;
	}

	const noteText = getNoteText(note);
	return mutes.some(p => p.test(noteText));
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
const userNotesPagination: Paging<'users/notes'> = {
	endpoint: 'users/notes' as const,
	limit: 10,
	params: computed(() => ({
		userId: selectedUserId.value,
		withRenotes: withUserRenotes.value,
		withReplies: withUserReplies.value,
	})),
};

const headerActions = computed(() => isWideViewport.value ? [
	{
		icon: 'ti ti-refresh',
		text: i18n.ts.reload,
		handler: () => reload(),
	} satisfies PageHeaderItem,
	{
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
				},
			], ev.currentTarget ?? ev.target);
		},
	} satisfies PageHeaderItem,
] : []);

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

definePageMetadata(() => ({
	title: i18n.ts.following,
	icon: 'ph-user-check ph-bold ph-lg',
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

	height: 100vh;
	max-width: 1200px;

	overflow: hidden;
}

.header {
	grid-area: header;
}

.notes {
	grid-area: notes;
	overflow: auto;
}

.user {
	grid-area: user;
	overflow: auto;
}

.userInfo {
	margin-bottom: 12px;
}

@container (min-width: 751px) {
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
