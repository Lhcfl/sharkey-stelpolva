<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs"/></template>
	<MkSpacer :contentMax="700">
		<MkHorizontalSwipe v-model:tab="tab" :tabs="headerTabs">
			<div v-if="tab === 'my'" key="my" class="_gaps">
				<MkButton primary rounded class="add" @click="create"><i class="ph-plus ph-bold ph-lg"></i> {{ i18n.ts.add }}</MkButton>

				<MkPagination v-slot="{items}" ref="pagingComponent" :pagination="pagination" class="_gaps">
					<MkA v-for="item in items" :key="item.id" :to="`/clips/${item.id}`">
						<MkClipPreview :clip="item"/>
					</MkA>
				</MkPagination>
			</div>
			<div v-else-if="tab === 'favorites'" key="favorites" class="_gaps">
				<MkA v-for="item in favorites" :key="item.id" :to="`/clips/${item.id}`">
					<MkClipPreview :clip="item"/>
				</MkA>
			</div>
		</MkHorizontalSwipe>
	</MkSpacer>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { watch, ref, shallowRef, computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkPagination from '@/components/MkPagination.vue';
import MkButton from '@/components/MkButton.vue';
import MkClipPreview from '@/components/MkClipPreview.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { clipsCache } from '@/cache.js';
import MkHorizontalSwipe from '@/components/MkHorizontalSwipe.vue';

const pagination = {
	endpoint: 'clips/list' as const,
	noPaging: true,
	limit: 10,
};

const tab = ref('my');

const favorites = ref<Misskey.entities.Clip[] | null>(null);

const pagingComponent = shallowRef<InstanceType<typeof MkPagination>>();

watch(tab, async () => {
	favorites.value = await misskeyApi('clips/my-favorites');
});

async function create() {
	const { canceled, result } = await os.form(i18n.ts.createNewClip, {
		name: {
			type: 'string',
			label: i18n.ts.name,
		},
		description: {
			type: 'string',
			required: false,
			multiline: true,
			treatAsMfm: true,
			label: i18n.ts.description,
		},
		isPublic: {
			type: 'boolean',
			label: i18n.ts.public,
			default: false,
		},
	});
	if (canceled) return;

	os.apiWithDialog('clips/create', result);

	clipsCache.delete();

	pagingComponent.value.reload();
}

function onClipCreated() {
	pagingComponent.value.reload();
}

function onClipDeleted() {
	pagingComponent.value.reload();
}

const headerActions = computed(() => []);

const headerTabs = computed(() => [{
	key: 'my',
	title: i18n.ts.myClips,
	icon: 'ph-paperclip ph-bold ph-lg',
}, {
	key: 'favorites',
	title: i18n.ts.favorites,
	icon: 'ph-heart ph-bold ph-lg',
}]);

definePageMetadata({
	title: i18n.ts.clip,
	icon: 'ph-paperclip ph-bold ph-lg',
	action: {
		icon: 'ph-plus ph-bold ph-lg',
		handler: create,
	},
});
</script>

<style lang="scss" module>

</style>
