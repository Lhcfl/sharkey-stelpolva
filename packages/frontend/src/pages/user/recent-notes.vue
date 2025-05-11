<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header>
		<MkPageHeader :actions="headerActions" :displayBackButton="true"/>
	</template>
	<SkUserRecentNotes ref="userRecentNotes" :class="$style.notes" :userId="userId" :withNonPublic="withNonPublic" :withQuotes="withQuotes" :withBots="withBots" :withReplies="withReplies" :onlyFiles="onlyFiles"/>
</MkStickyContainer>
</template>

<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import type { PageHeaderItem } from '@/types/page-header.js';
import { i18n } from '@/i18n.js';
import MkPageHeader from '@/components/global/MkPageHeader.vue';
import SkUserRecentNotes from '@/components/SkUserRecentNotes.vue';
import { acct } from '@/filters/user.js';
import { createModel, createHeaderItem } from '@/utility/following-feed-utils.js';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import { definePage } from '@/page';

defineProps<{
	userId: string;
}>();

const userRecentNotes = shallowRef<InstanceType<typeof SkUserRecentNotes>>();
const user = computed(() => userRecentNotes.value?.user);

const {
	withNonPublic,
	withQuotes,
	withBots,
	withReplies,
	onlyFiles,
} = createModel();

const headerActions: PageHeaderItem[] = [
	{
		icon: 'ti ti-refresh',
		text: i18n.ts.reload,
		handler: () => userRecentNotes.value?.reload(),
	},
	createHeaderItem(),
];

// Based on user/index.vue
definePage(() => ({
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
@container (min-width: 451px) {
	.notes {
		padding: 12px;
	}
}

@container (min-width: 750px) {
	.notes {
		padding: 24px;
	}
}
</style>
