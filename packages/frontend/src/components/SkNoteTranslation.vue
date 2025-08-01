<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

Displays a translated version of a note.
-->

<template>
<div v-if="translating || translation != null" :class="$style.translation">
	<MkLoading v-if="translating" mini/>
	<div v-else-if="translation && translation.text != null">
		<b v-if="translation.sourceLang">{{ i18n.tsx.translatedFrom({ x: translation.sourceLang }) }}: </b>
		<Mfm :text="translation.text" :isBlock="true" :author="note.user" :nyaize="'respect'" :emojiUrls="note.emojis" class="_selectable"/>
	</div>
	<div v-else>{{ i18n.ts.translationFailed }}</div>
</div>
</template>

<script setup lang="ts">
import * as Misskey from 'misskey-js';
import { watch } from 'vue';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	translating?: boolean;
	translation?: Misskey.entities.NotesTranslateResponse | false | null;
}>(), {
	translating: false,
	translation: null,
});

if (_DEV_) {
	// Prop watch syntax: https://stackoverflow.com/a/59127059
	watch(
		[() => props.translation, () => props.translating],
		([translation, translating]) => console.debug('Translation status changed: ', { translation, translating }),
	);
}
</script>

<style module lang="scss">
.translation {
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	padding: 12px;
	margin-top: 8px;
}
</style>
