<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<input v-model="query" :class="$style.input" type="search" :placeholder="q">
	<button :class="$style.button" @click="search"><i class="ph-magnifying-glass ph-bold ph-lg"></i> {{ i18n.ts.searchByGoogle }}</button>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { i18n } from '@/i18n.js';
import { defaultStore } from '@/store';

const props = defineProps<{
	q: string;
}>();

const query = ref(props.q);

const search = () => {
	const searchQuery = encodeURIComponent(query.value);
	const searchUrl = defaultStore.state.searchEngine.replace(/{query}|%s\b/g, searchQuery);

	window.open(searchUrl, '_blank', 'noopener');
};
</script>

<style lang="scss" module>
.root {
	display: flex;
	margin: 8px 0;
}

.input {
	flex-shrink: 1;
	padding: 10px;
	width: 100%;
	height: 40px;
	font-size: 16px;
	border: solid 1px var(--divider);
	border-radius: var(--radius-xs) 0 0 var(--radius-xs);
	-webkit-appearance: textfield;
}

.button {
	flex-shrink: 0;
	margin: 0;
	padding: 0 16px;
	border: solid 1px var(--divider);
	border-left: none;
	border-radius: 0 var(--radius-xs) var(--radius-xs) 0;

	&:active {
		box-shadow: 0 2px 4px rgba(#000, 0.15) inset;
	}
}
</style>
