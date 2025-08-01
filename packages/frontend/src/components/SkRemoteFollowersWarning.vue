<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

Warning in the following feed/column that remote users may have incomplete/outdated activity.
-->

<template>
<MkInfo v-if="showRemoteWarning" warn closable @close="closeWarning">
	{{ i18n.ts.remoteFollowersWarning }}
</MkInfo>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FollowingFeedModel } from '@/types/following-feed.js';
import { i18n } from '@/i18n.js';
import MkInfo from '@/components/MkInfo.vue';
import { followersTab } from '@/types/following-feed.js';

const props = defineProps<{
	model: FollowingFeedModel,
}>();

// eslint-disable-next-line vue/no-setup-props-reactivity-loss
const { model: { userList, remoteWarningDismissed } } = props;

const showRemoteWarning = computed(
	() => userList.value === followersTab && !remoteWarningDismissed.value,
);

function closeWarning() {
	remoteWarningDismissed.value = true;
}
</script>
