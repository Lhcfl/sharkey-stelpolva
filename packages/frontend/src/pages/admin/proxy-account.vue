<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader :actions="headerActions" :tabs="headerTabs"/></template>
	<MkSpacer :contentMax="700" :marginMin="16" :marginMax="32">
		<FormSuspense :p="init">
			<MkInfo>{{ i18n.ts.proxyAccountDescription }}</MkInfo>
			<MkKeyValue>
				<template #key>{{ i18n.ts.proxyAccount }}</template>
				<template #value>{{ proxyAccount ? `@${proxyAccount.username}` : i18n.ts.none }}</template>
			</MkKeyValue>

			<div class="_gaps" style="flex-direction:row">
				<MkButton primary @click="chooseProxyAccount">{{ i18n.ts.selectAccount }}</MkButton>
				<MkButton :disabled="proxyAccount == null" danger @click="resetProxyAccount">Reset</MkButton>
			</div>
		</FormSuspense>
	</MkSpacer>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkKeyValue from '@/components/MkKeyValue.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import FormSuspense from '@/components/form/suspense.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';

const proxyAccount = ref<Misskey.entities.UserDetailed | null>(null);
const proxyAccountId = ref<string | null>(null);

async function init() {
	const meta = await misskeyApi('admin/meta');
	proxyAccountId.value = meta.proxyAccountId;
	if (proxyAccountId.value) {
		proxyAccount.value = await misskeyApi('users/show', { userId: proxyAccountId.value });
	}
}

function chooseProxyAccount() {
	os.selectUser().then(user => {
		proxyAccount.value = user;
		proxyAccountId.value = user.id;
		save();
	});
}

async function resetProxyAccount() {
	const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts.areYouSure });

	if (canceled) {
		return;
	}

	proxyAccount.value = null;
	proxyAccountId.value = null;
	save();
}

function save() {
	os.apiWithDialog('admin/update-meta', {
		proxyAccountId: proxyAccountId.value,
	}).then(() => {
		fetchInstance();
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePageMetadata({
	title: i18n.ts.proxyAccount,
	icon: 'ph-ghost ph-bold ph-lg',
});
</script>
