<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><XHeader :actions="headerActions" :tabs="headerTabs"/></template>
	<MkSpacer :contentMax="700" :marginMin="16" :marginMax="32">
		<FormSuspense :p="init">
			<MkFolder>
				<template #label>DeepL Translation</template>

				<div class="_gaps_m">
					<MkInput v-model="deeplAuthKey">
						<template #prefix><i class="ti ti-key"></i></template>
						<template #label>DeepL Auth Key</template>
					</MkInput>
					<MkSwitch v-model="deeplIsPro">
						<template #label>Pro account</template>
					</MkSwitch>

					<MkSwitch v-model="deeplFreeMode">
						<template #label>{{ i18n.ts.deeplFreeMode }}</template>
					</MkSwitch>
					<MkInput v-if="deeplFreeMode" v-model="deeplFreeInstance" :placeholder="'example.com/translate'">
						<template #prefix><i class="ph-globe-simple ph-bold ph-lg"></i></template>
						<template #label>DeepLX-JS URL</template>
						<template #caption>{{ i18n.ts.deeplFreeModeDescription }}</template>
					</MkInput>

					<MkButton primary @click="save_deepl">Save</MkButton>
				</div>
			</MkFolder>
		</FormSuspense>
	</MkSpacer>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import XHeader from './_header_.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import FormSuspense from '@/components/form/suspense.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import MkFolder from '@/components/MkFolder.vue';

const deeplAuthKey = ref<string>('');
const deeplIsPro = ref<boolean>(false);
const deeplFreeMode = ref<boolean>(false);
const deeplFreeInstance = ref<string>('');

async function init() {
	const meta = await misskeyApi('admin/meta');
	deeplAuthKey.value = meta.deeplAuthKey;
	deeplIsPro.value = meta.deeplIsPro;
	deeplFreeMode.value = meta.deeplFreeMode;
	deeplFreeInstance.value = meta.deeplFreeInstance;
}

function save_deepl() {
	os.apiWithDialog('admin/update-meta', {
		deeplAuthKey: deeplAuthKey.value,
		deeplIsPro: deeplIsPro.value,
		deeplFreeMode: deeplFreeMode.value,
		deeplFreeInstance: deeplFreeInstance.value,
	}).then(() => {
		fetchInstance(true);
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePageMetadata(() => ({
	title: i18n.ts.externalServices,
	icon: 'ph-arrow-square-out ph-bold ph-lg',
}));
</script>
