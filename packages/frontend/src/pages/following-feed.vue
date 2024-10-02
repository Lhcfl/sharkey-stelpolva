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
								<img :src="infoImageUrl" class="_ghost" :alt="i18n.ts.noNotes" aria-hidden="true"/>
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
					<div v-if="selectedUser" :class="$style.userInfo">
						<MkUserInfo class="user" :user="selectedUser"/>
						<MkNotes :noGap="true" :pagination="userPagination"/>
					</div>
					<div v-else-if="selectedUserError" :class="$style.list">{{ selectedUserError }}</div>
					<MkLoading v-else/>
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

const props = withDefaults(defineProps<{
	initialTab?: FollowingFeedTab,
}>(), {
	initialTab: followingTab,
});

// Vue complains, but we *want* to lose reactivity here.
// Otherwise the use would be unable to change the tab.
// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const currentTab: Ref<FollowingFeedTab> = ref(props.initialTab);
const mutualsOnly: Ref<boolean> = computed(() => currentTab.value === mutualsTab);

const selectedUserError: Ref<string> = ref('');
const selectedUserId: Ref<string> = ref('');
const selectedUser: Ref<Misskey.entities.UserDetailed | null> = ref(null);

async function selectUser(userId: string): Promise<void> {
	selectedUserError.value = '';
	selectedUserId.value = userId;
	selectedUser.value = null;

	if (userId) {
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

const listPaging = shallowRef<InstanceType<typeof MkPagination>>();

async function reloadList() {
	await listPaging.value?.reload();
}

async function reloadUser() {
	await selectUser(selectedUserId.value);
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

.userInfo {
	display: flex;
	flex-direction: column;
	align-items: stretch;
}

.userInfo > :not(:first-child) {
	margin-top: 6px;
}

.userInfo > :not(:last-child) {
	margin-bottom: 6px;
}

@container (min-width: 451px) {
	.userInfo > :not(:first-child) {
		margin-top: 12px;
	}

	.userInfo > :not(:last-child) {
		margin-bottom: 12px;
	}
}
</style>
