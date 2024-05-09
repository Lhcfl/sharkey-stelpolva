<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader v-model:tab="tab" :displayBackButton="true" :actions="headerActions" :tabs="headerTabs"/></template>
	<div>
		<div v-if="user">
			<MkHorizontalSwipe v-model:tab="tab" :tabs="headerTabs">
				<XHome v-if="tab === 'home'" key="home" :user="user"/>
				<MkSpacer v-else-if="tab === 'notes'" key="notes" :contentMax="800" style="padding-top: 0">
					<XTimeline :user="user"/>
				</MkSpacer>
				<XActivity v-else-if="tab === 'activity'" key="activity" :user="user"/>
				<XAchievements v-else-if="tab === 'achievements'" key="achievements" :user="user"/>
				<XReactions v-else-if="tab === 'reactions'" key="reactions" :user="user"/>
				<XClips v-else-if="tab === 'clips'" key="clips" :user="user"/>
				<XLists v-else-if="tab === 'lists'" key="lists" :user="user"/>
				<XPages v-else-if="tab === 'pages'" key="pages" :user="user"/>
				<XFlashs v-else-if="tab === 'flashs'" key="flashs" :user="user"/>
				<XGallery v-else-if="tab === 'gallery'" key="gallery" :user="user"/>
				<XRaw v-else-if="tab === 'raw'" key="raw" :user="user"/>
			</MkHorizontalSwipe>
		</div>
		<MkError v-else-if="error" @retry="fetchUser()"/>
		<MkLoading v-else/>
	</div>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, computed, watch, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { acct as getAcct } from '@/filters/user.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/account.js';
import MkHorizontalSwipe from '@/components/MkHorizontalSwipe.vue';

const XHome = defineAsyncComponent(() => import('./home.vue'));
const XTimeline = defineAsyncComponent(() => import('./index.timeline.vue'));
const XActivity = defineAsyncComponent(() => import('./activity.vue'));
const XAchievements = defineAsyncComponent(() => import('./achievements.vue'));
const XReactions = defineAsyncComponent(() => import('./reactions.vue'));
const XClips = defineAsyncComponent(() => import('./clips.vue'));
const XLists = defineAsyncComponent(() => import('./lists.vue'));
const XPages = defineAsyncComponent(() => import('./pages.vue'));
const XFlashs = defineAsyncComponent(() => import('./flashs.vue'));
const XGallery = defineAsyncComponent(() => import('./gallery.vue'));
const XRaw = defineAsyncComponent(() => import('./raw.vue'));

const props = withDefaults(defineProps<{
	acct: string;
	page?: string;
}>(), {
	page: 'home',
});

const tab = ref(props.page);

const user = ref<null | Misskey.entities.UserDetailed>(null);
const error = ref<any>(null);

function fetchUser(): void {
	if (props.acct == null) return;
	user.value = null;
	misskeyApi('users/show', Misskey.acct.parse(props.acct)).then(u => {
		user.value = u;
	}).catch(err => {
		error.value = err;
	});
}

watch(() => props.acct, fetchUser, {
	immediate: true,
});

const headerActions = computed(() => []);

const headerTabs = computed(() => user.value ? [{
	key: 'home',
	title: i18n.ts.overview,
	icon: 'ph-house ph-bold ph-lg',
}, {
	key: 'notes',
	title: i18n.ts.notes,
	icon: 'ph-pencil-simple ph-bold ph-lg',
}, {
	key: 'activity',
	title: i18n.ts.activity,
	icon: 'ph-chart-line ph-bold ph-lg',
}, ...(user.value.host == null ? [{
	key: 'achievements',
	title: i18n.ts.achievements,
	icon: 'ph-trophy ph-bold ph-lg',
}] : []), ...($i && ($i.id === user.value.id || $i.isAdmin || $i.isModerator)) || user.value.publicReactions ? [{
	key: 'reactions',
	title: i18n.ts.reaction,
	icon: 'ph-smiley ph-bold ph-lg',
}] : [], {
	key: 'clips',
	title: i18n.ts.clips,
	icon: 'ph-paperclip ph-bold ph-lg',
}, {
	key: 'lists',
	title: i18n.ts.lists,
	icon: 'ph-list ph-bold ph-lg',
}, {
	key: 'pages',
	title: i18n.ts.pages,
	icon: 'ph-newspaper ph-bold ph-lg',
}, {
	key: 'flashs',
	title: 'Play',
	icon: 'ph-play ph-bold ph-lg',
}, {
	key: 'gallery',
	title: i18n.ts.gallery,
	icon: 'ph-images-square ph-bold ph-lg',
}, {
	key: 'raw',
	title: 'Raw',
	icon: 'ph-code ph-bold ph-lg',
}] : []);

definePageMetadata(() => ({
	title: i18n.ts.user,
	icon: 'ph-user ph-bold ph-lg',
	...user.value ? {
		title: user.value.name ? ` (@${user.value.username})` : `@${user.value.username}`,
		subtitle: `@${getAcct(user.value)}`,
		userName: user.value,
		avatar: user.value,
		path: `/@${user.value.username}`,
		share: {
			title: user.value.name,
		},
	} : {},
}));
</script>
