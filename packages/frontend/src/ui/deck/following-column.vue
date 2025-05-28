<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- based on list-column.vue -->

<template>
<XColumn :menu="menu" :column="column" :isStacked="isStacked" :refresher="reload">
	<template #header>
		<i :class="columnIcon" aria-hidden="true"/><span style="margin-left: 8px;">{{ (column.name || column.userList) ?? i18n.ts._deck._columns.following }}</span>
	</template>

	<SkRemoteFollowersWarning :class="$style.followersWarning" :model="model"/>
	<SkFollowingRecentNotes ref="latestNotes" :userList="userList" :withNonPublic="withNonPublic" :withQuotes="withQuotes" :withReplies="withReplies" :withBots="withBots" :onlyFiles="onlyFiles" @userSelected="userSelected"/>
</XColumn>
</template>

<script lang="ts">
import { computed, shallowRef } from 'vue';
import type { Column } from '@/deck.js';
import type { FollowingFeedState } from '@/types/following-feed.js';
export type FollowingColumn = Column & Partial<FollowingFeedState>;
</script>

<script setup lang="ts">
import type { FollowingFeedTab } from '@/types/following-feed.js';
import type { MenuItem } from '@/types/menu.js';
import { getColumn, updateColumn } from '@/deck.js';
import XColumn from '@/ui/deck/column.vue';
import SkFollowingRecentNotes from '@/components/SkFollowingRecentNotes.vue';
import SkRemoteFollowersWarning from '@/components/SkRemoteFollowersWarning.vue';
import { followingTab, followingFeedTabs } from '@/types/following-feed.js';
import { createModel, createOptionsMenu, followingTabName, followingTabIcon } from '@/utility/following-feed-utils.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';

const props = defineProps<{
	column: FollowingColumn;
	isStacked: boolean;
}>();

const columnIcon = computed(() => followingTabIcon(props.column.userList));

async function selectList(): Promise<void> {
	const { canceled, result: newList } = await os.select<FollowingFeedTab>({
		title: i18n.ts.selectFollowRelationship,
		items: followingFeedTabs.map(t => ({
			value: t,
			text: followingTabName(t),
		})),
		default: props.column.userList ?? followingTab,
	});

	if (canceled) return;

	updateColumn(props.column.id, {
		name: getNewColumnName(newList),
		userList: newList,
	} as Partial<FollowingColumn>);
}

function getNewColumnName(newList: FollowingFeedTab) {
	// If the user has renamed the column, then we need to keep that name.
	// If no list is specified, then the column is newly created and the user *can't* have renamed it.
	if (props.column.userList && props.column.name === followingTabName(props.column.userList)) {
		return props.column.name;
	}

	// Otherwise, we should match the name to the selected list.
	return followingTabName(newList);
}

if (!props.column.userList) {
	await selectList();
}

// Redirects the Following Feed logic into column-specific storage.
// This allows multiple columns to exist with different settings.
const columnStorage = computed(() => ({
	state: getColumn<FollowingColumn>(props.column.id),
	save(updated: FollowingColumn) {
		updateColumn(props.column.id, updated);
	},
}));

const model = createModel(columnStorage);
const {
	userList,
	withNonPublic,
	withQuotes,
	withReplies,
	withBots,
	onlyFiles,
} = model;

const menu: MenuItem[] = [
	{
		icon: columnIcon.value,
		text: i18n.ts.selectFollowRelationship,
		action: selectList,
	},
	...createOptionsMenu(columnStorage),
];

const latestNotes = shallowRef<InstanceType<typeof SkFollowingRecentNotes>>();

async function reload() {
	await latestNotes.value?.reload();
}

const router = useRouter();

function userSelected(userId: string) {
	router.push(`/following-feed/${userId}`);
}
</script>

<style lang="scss" module>
.followersWarning {
	margin-bottom: 8px;
	border-radius: 0;
}
</style>
