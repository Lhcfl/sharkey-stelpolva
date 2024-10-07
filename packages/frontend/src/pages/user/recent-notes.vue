<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header>
		<MkPageHeader :actions="headerActions" :displayBackButton="true"/>
	</template>
	<SkUserRecentNotes ref="userRecentNotes" :userId="userId" :withRenotes="withRenotes" :withReplies="withReplies" :onlyFiles="onlyFiles"/>
</MkStickyContainer>
</template>

<script setup lang="ts">

import { computed, ref, shallowRef } from 'vue';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { i18n } from '@/i18n.js';
import { PageHeaderItem } from '@/types/page-header.js';
import * as os from '@/os.js';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import SkUserRecentNotes from '@/components/SkUserRecentNotes.vue';
import { acct } from '@/filters/user.js';

defineProps<{
	userId: string;
}>();

const userRecentNotes = shallowRef<InstanceType<typeof SkUserRecentNotes>>();
const user = computed(() => userRecentNotes.value?.user);
const withRenotes = ref(false);
const withReplies = ref(true);
const onlyFiles = ref(false);

const headerActions = [
	{
		icon: 'ti ti-refresh',
		text: i18n.ts.reload,
		handler: () => userRecentNotes.value?.reload(),
	} satisfies PageHeaderItem,
	{
		icon: 'ti ti-dots',
		text: i18n.ts.options,
		handler: (ev) => {
			os.popupMenu([
				{
					type: 'switch',
					text: i18n.ts.showRenotes,
					ref: withRenotes,
				}, {
					type: 'switch',
					text: i18n.ts.showRepliesToOthersInTimeline,
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
	} satisfies PageHeaderItem,
];

// Based on user/index.vue
definePageMetadata(() => ({
	title: i18n.ts.user,
	icon: 'ti ti-user',
	...user.value ? {
		title: user.value.name ? ` (@${user.value.username})` : `@${user.value.username}`,
		subtitle: `@${acct(user.value)}`,
		userName: user.value,
		avatar: user.value,
		path: `/@${user.value.username}`,
		share: {
			title: user.value.name,
		},
	} : {},
}));

</script>

<style lang="scss" module>

</style>
