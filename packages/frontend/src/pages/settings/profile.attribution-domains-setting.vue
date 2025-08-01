<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkTextarea v-model="attributionDomains">
	<template #label><SearchLabel>{{ i18n.ts.attributionDomains }}</SearchLabel></template>
	<template #caption>
		{{ i18n.ts.attributionDomainsDescription }}
		<br/>
		<Mfm :text="tutorialTag"/>
	</template>
</MkTextarea>
<MkButton primary :disabled="!changed" @click="save()"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
</template>

<script lang="ts" setup>
import { ref, watch, computed } from 'vue';
import { host as hostRaw } from '@@/js/config.js';
import { toUnicode } from 'punycode.js';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const $i = ensureSignin();

const attributionDomains = ref($i.attributionDomains.join('\n'));
const domainArray = computed(() => {
	return attributionDomains.value
		.trim().split('\n')
		.map(el => el.trim().toLowerCase())
		.filter(el => el);
});
const changed = ref(false);
const tutorialTag = '`<meta name="fediverse:creator" content="' + $i.username + '@' + toUnicode(hostRaw) + '" />`';

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
		attributionDomains: domainArray.value,
	});

	// Refresh filtered list to signal to the user how they've been saved
	attributionDomains.value = domainArray.value.join('\n');

	changed.value = false;
}

watch(domainArray, (newArray, oldArray) => {
	// compare arrays
	if (newArray.length !== oldArray.length || !newArray.every((a, i) => a === oldArray[i])) {
		changed.value = true;
	}
});
</script>
