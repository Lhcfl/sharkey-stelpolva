<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkPullToRefresh :refresher="() => reload()">
	<div v-if="user" :class="$style.userInfo">
		<MkUserInfo :class="$style.userInfo" class="user" :user="user"/>
		<MkNotes :noGap="true" :pagination="pagination"/>
	</div>
	<div v-else-if="loadError" :class="$style.panel">{{ loadError }}</div>
	<MkLoading v-else-if="userId"/>
</MkPullToRefresh>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, Ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkLoading from '@/components/global/MkLoading.vue';
import MkNotes from '@/components/MkNotes.vue';
import MkUserInfo from '@/components/MkUserInfo.vue';
import MkPullToRefresh from '@/components/MkPullToRefresh.vue';
import { Paging } from '@/components/MkPagination.vue';
import { misskeyApi } from '@/scripts/misskey-api.js';

const props = withDefaults(defineProps<{
	userId: string;
	withRenotes?: boolean;
	withReplies?: boolean;
	onlyFiles?: boolean;
}>(), {
	withRenotes: false,
	withReplies: true,
	onlyFiles: false,
});

const loadError: Ref<string | null> = ref(null);
const user: Ref<Misskey.entities.UserDetailed | null> = ref(null);

const pagination: Paging<'users/notes'> = {
	endpoint: 'users/notes' as const,
	limit: 10,
	params: computed(() => ({
		userId: props.userId,
		withRenotes: props.withRenotes,
		withReplies: props.withReplies,
		withFiles: props.onlyFiles,
	})),
};

defineExpose({
	reload,
	user,
});

async function reload(): Promise<void> {
	loadError.value = null;
	user.value = null;

	await Promise
		.all([
			// We need a User entity, but the pagination returns only UserLite.
			// An additional request is needed to "upgrade" the object.
			misskeyApi('users/show', { userId: props.userId }),

			// Wait for 1 second to match the animation effects in MkHorizontalSwipe, MkPullToRefresh, and MkPagination.
			// Otherwise, the page appears to load "backwards".
			new Promise(resolve => setTimeout(resolve, 1000)),
		])
		.then(([u]) => user.value = u)
		.catch(error => {
			console.error('Error fetching user info', error);

			return error.value =
				typeof(error) === 'string'
					? String(error)
					: JSON.stringify(error);
		});
}

watch(() => props.userId, async () => {
	await reload();
});

onMounted(async () => {
	await reload();
});

</script>

<style lang="scss" module>

.panel {
	background: var(--panel);
}

.userInfo {
	margin-bottom: 12px;
}

@container (min-width: 451px) {
	.userInfo {
		margin-bottom: 24px;
	}
}

</style>
