<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 1200px;">
	<MkTab v-if="instance.federation !== 'none'" v-model="origin" style="margin-bottom: var(--MI-margin);">
		<option value="local">{{ i18n.ts.local }}</option>
		<option value="remote">{{ i18n.ts.remote }}</option>
	</MkTab>
	<div v-if="origin === 'local'">
		<template v-if="tag == null">
			<MkFoldableSection class="_margin" persistKey="explore-pinned-users">
				<template #header><i class="ti ti-bookmark ti-fw" style="margin-right: 0.5em;"></i>{{ i18n.ts.pinnedUsers }}</template>
				<MkUserList :pagination="pinnedUsers"/>
			</MkFoldableSection>
			<MkFoldableSection class="_margin" persistKey="explore-popular-users">
				<template #header><i class="ti ti-chart-line ti-fw" style="margin-right: 0.5em;"></i>{{ i18n.ts.popularUsers }}</template>
				<MkUserList :pagination="popularUsers"/>
			</MkFoldableSection>
			<MkFoldableSection class="_margin" persistKey="explore-recently-updated-users">
				<template #header><i class="ph-chat-text ph-bold ph-lg ti-fw" style="margin-right: 0.5em;"></i>{{ i18n.ts.recentlyUpdatedUsers }}</template>
				<MkUserList :pagination="recentlyUpdatedUsers"/>
			</MkFoldableSection>
			<MkFoldableSection class="_margin" persistKey="explore-recently-registered-users">
				<template #header><i class="ti ti-plus ti-fw" style="margin-right: 0.5em;"></i>{{ i18n.ts.recentlyRegisteredUsers }}</template>
				<MkUserList :pagination="recentlyRegisteredUsers"/>
			</MkFoldableSection>
		</template>
	</div>
	<div v-else>
		<MkFoldableSection ref="tagsEl" :foldable="true" :expanded="false" class="_margin">
			<template #header><i class="ti ti-hash ti-fw" style="margin-right: 0.5em;"></i>{{ i18n.ts.popularTags }}</template>

			<div>
				<MkA v-for="tag in tagsLocal" :key="'local:' + tag.tag" :to="`/user-tags/${tag.tag}`" style="margin-right: 16px; font-weight: bold;">{{ tag.tag }}</MkA>
				<MkA v-for="tag in tagsRemote" :key="'remote:' + tag.tag" :to="`/user-tags/${tag.tag}`" style="margin-right: 16px;">{{ tag.tag }}</MkA>
			</div>
		</MkFoldableSection>

		<MkFoldableSection v-if="tag != null" :key="`${tag}`" class="_margin">
			<template #header><i class="ti ti-hash ti-fw" style="margin-right: 0.5em;"></i>{{ tag }}</template>
			<MkUserList :pagination="tagUsers"/>
		</MkFoldableSection>

		<template v-if="tag == null">
			<MkFoldableSection class="_margin">
				<template #header><i class="ti ti-chart-line ti-fw" style="margin-right: 0.5em;"></i>{{ i18n.tsx.popularUsersLocal({ name: instance.name ?? host }) }}</template>
				<MkUserList :pagination="popularUsersLocalF"/>
			</MkFoldableSection>
			<MkFoldableSection class="_margin">
				<template #header><i class="ti ti-chart-line ti-fw" style="margin-right: 0.5em;"></i>{{ i18n.ts.popularUsersGlobal }}</template>
				<MkUserList :pagination="popularUsersF"/>
			</MkFoldableSection>
			<MkFoldableSection class="_margin">
				<template #header><i class="ph-chat-text ph-bold ph-lg ti-fw" style="margin-right: 0.5em;"></i>{{ i18n.ts.recentlyUpdatedUsers }}</template>
				<MkUserList :pagination="recentlyUpdatedUsersF"/>
			</MkFoldableSection>
			<MkFoldableSection class="_margin">
				<template #header><i class="ti ti-rocket ti-fw" style="margin-right: 0.5em;"></i>{{ i18n.ts.recentlyDiscoveredUsers }}</template>
				<MkUserList :pagination="recentlyRegisteredUsersF"/>
			</MkFoldableSection>
		</template>
	</div>
</div>
</template>

<script lang="ts" setup>
import { watch, ref, useTemplateRef, computed } from 'vue';
import * as Misskey from 'misskey-js';
import { host } from '@@/js/config';
import MkUserList from '@/components/MkUserList.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkTab from '@/components/MkTab.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { instance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	tag?: string | undefined;
}>();

const origin = ref('local');
const tagsEl = useTemplateRef('tagsEl');
const tagsLocal = ref<Misskey.entities.Hashtag[]>([]);
const tagsRemote = ref<Misskey.entities.Hashtag[]>([]);

watch(() => props.tag, () => {
	if (tagsEl.value) tagsEl.value.toggleContent(props.tag == null);
});

const tagUsers = computed(() => ({
	endpoint: 'hashtags/users',
	limit: 30,
	params: {
		tag: props.tag,
		origin: 'combined',
		sort: '+follower',
	},
} as const));

const pinnedUsers = { endpoint: 'pinned-users', limit: 10, noPaging: true } as const;
const popularUsers = { endpoint: 'users', limit: 10, noPaging: true, params: {
	state: 'alive',
	origin: 'local',
	sort: '+follower',
} } as const;
const recentlyUpdatedUsers = { endpoint: 'users', limit: 10, noPaging: true, params: {
	origin: 'local',
	sort: '+updatedAt',
} } as const;
const recentlyRegisteredUsers = { endpoint: 'users', limit: 10, noPaging: true, params: {
	origin: 'local',
	state: 'alive',
	sort: '+createdAt',
} } as const;
const popularUsersF = { endpoint: 'users', limit: 10, noPaging: true, params: {
	state: 'alive',
	origin: 'remote',
	sort: '+follower',
} } as const;
const popularUsersLocalF = { endpoint: 'users', limit: 10, noPaging: true, params: {
	state: 'alive',
	origin: 'remote',
	sort: '+localFollower',
} } as const;
const recentlyUpdatedUsersF = { endpoint: 'users', limit: 10, noPaging: true, params: {
	origin: 'combined',
	sort: '+updatedAt',
} } as const;
const recentlyRegisteredUsersF = { endpoint: 'users', limit: 10, noPaging: true, params: {
	origin: 'combined',
	sort: '+createdAt',
} } as const;

misskeyApi('hashtags/list', {
	sort: '+attachedLocalUsers',
	attachedToLocalUserOnly: true,
	limit: 30,
}).then(tags => {
	tagsLocal.value = tags;
});
misskeyApi('hashtags/list', {
	sort: '+attachedRemoteUsers',
	attachedToRemoteUserOnly: true,
	limit: 30,
}).then(tags => {
	tagsRemote.value = tags;
});
</script>
