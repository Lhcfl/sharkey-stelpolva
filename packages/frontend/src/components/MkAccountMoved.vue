<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="user" :class="$style.root">
	<i class="ti ti-plane-departure" style="margin-right: 8px;"></i>
	{{ i18n.ts.accountMoved }}
	<MkMention v-if="user" :class="$style.link" :username="user.username" :host="user.host ?? localHost"/>
	<MkLink v-else :url="movedToUri"/>
</div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkMention from './MkMention.vue';
import { i18n } from '@/i18n.js';
import { host as localHost } from '@@/js/config.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkLink from '@/components/MkLink.vue';

const user = ref<Misskey.entities.UserLite | null>();

const props = defineProps<{
	movedTo?: string | null; // user id
	movedToUri: string; // user URI
}>();

watch(() => props.movedTo, () => {
	user.value = null;
	if (props.movedTo) {
		misskeyApi('users/show', { userId: props.movedTo }).then(u => user.value = u);
	}
}, {
	immediate: true,
});
</script>

<style lang="scss" module>
.root {
	padding: 16px;
	font-size: 90%;
	background: var(--MI_THEME-infoWarnBg);
	color: var(--MI_THEME-error);
	border-radius: var(--MI-radius);
}

.link {
	margin-left: 4px;
}
</style>
