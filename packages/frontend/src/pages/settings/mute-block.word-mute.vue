<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<div>
		<MkTextarea v-model="mutedWords">
			<span>{{ i18n.ts._wordMute.muteWords }}</span>
			<template #caption>{{ i18n.ts._wordMute.muteWordsDescription }}<br>{{ i18n.ts._wordMute.muteWordsDescription2 }}</template>
		</MkTextarea>
	</div>

	<SkPatternTest :mutedWords="mutedWords"></SkPatternTest>

	<MkButton primary inline :disabled="!changed" @click="save()"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
</div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { parseMutes } from '@/utility/parse-mutes';
import SkPatternTest from '@/components/SkPatternTest.vue';

const props = defineProps<{
	muted: (string[] | string)[];
}>();

const emit = defineEmits<{
	(ev: 'save', value: (string[] | string)[]): void;
}>();

const render = (mutedWords: (string | string[])[]) => mutedWords.map(x => {
	if (Array.isArray(x)) {
		return x.join(' ');
	} else {
		return x;
	}
}).join('\n');

const mutedWords = ref(render(props.muted));
const changed = ref(false);

watch(mutedWords, () => {
	changed.value = true;
});

async function save() {
	try {
		const parsed = parseMutes(mutedWords.value);

		emit('save', parsed);

		changed.value = false;
	} catch {
		// already displayed error message in parseMutes
		return;
	}
}
</script>
