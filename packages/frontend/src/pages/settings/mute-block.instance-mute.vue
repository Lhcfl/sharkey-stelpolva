<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<MkInfo>{{ i18n.ts._instanceMute.title }}</MkInfo>
	<MkTextarea v-model="instanceMutes">
		<template #label>{{ i18n.ts._instanceMute.heading }}</template>
		<template #caption>{{ i18n.ts._instanceMute.instanceMuteDescription }}<br>{{ i18n.ts._instanceMute.instanceMuteDescription2 }}</template>
	</MkTextarea>
	<MkButton primary :disabled="!changed" @click="save()"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
</div>
</template>

<script lang="ts" setup>
import { ref, watch, computed } from 'vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkButton from '@/components/MkButton.vue';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const $i = ensureSignin();

const instanceMutes = ref($i.mutedInstances.join('\n'));
const domainArray = computed(() => {
	return instanceMutes.value
		.trim().split('\n')
		.map(el => el.trim().toLowerCase())
		.filter(el => el);
});
const changed = ref(false);

async function save() {
	// checks for a full line without whitespace.
	if (!domainArray.value.every(d => /^\S+$/.test(d))) {
		os.alert({
			type: 'error',
			title: i18n.ts.invalidValue,
		});
		return;
	}

	await misskeyApi('i/update', {
		mutedInstances: domainArray.value,
	});

	// Refresh filtered list to signal to the user how they've been saved
	instanceMutes.value = domainArray.value.join('\n');

	changed.value = false;
}

watch(domainArray, (newArray, oldArray) => {
	// compare arrays
	if (newArray.length !== oldArray.length || !newArray.every((a, i) => a === oldArray[i])) {
		changed.value = true;
	}
});
</script>
