<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

Allows a user to write text to test their word mutes against, displaying matched words.
-->

<template>
<MkFolder>
	<template #label>{{ i18n.ts.wordMuteTestLabel }}</template>

	<div class="_gaps">
		<MkTextarea v-model="testWords">
			<template #caption>{{ i18n.ts.wordMuteTestDescription }}</template>
		</MkTextarea>
		<div><MkButton :disabled="!testWords" @click="testWordMutes">{{ i18n.ts.wordMuteTestTest }}</MkButton></div>
		<div v-if="testMatches == null">{{ i18n.ts.wordMuteTestNoResults }}</div>
		<div v-else-if="testMatches === ''">{{ i18n.ts.wordMuteTestNoMatch }}</div>
		<div v-else>{{ i18n.tsx.wordMuteTestMatch({ words: testMatches }) }}</div>
	</div>
</MkFolder>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { i18n } from '@/i18n';
import MkFolder from '@/components/MkFolder.vue';
import MkButton from '@/components/MkButton.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { parseMutes } from '@/utility/parse-mutes';
import { checkWordMute } from '@/utility/check-word-mute';

const props = defineProps<{
	mutedWords?: string | null,
}>();

const testWords = ref<string | null>(null);
const testMatches = ref<string | null>(null);

function testWordMutes() {
	if (!testWords.value || !props.mutedWords) {
		testMatches.value = null;
		return;
	}

	try {
		const mutes = parseMutes(props.mutedWords);
		const matches = checkWordMute(testWords.value, null, mutes);
		testMatches.value = matches ? matches.join(', ') : '';
	} catch {
		// Error is displayed by above function
		testMatches.value = null;
	}
}
</script>

<style module lang="scss">

</style>
