<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

List of errors for a viewed note.
-->

<template>
<!-- Match appearance of MkRemoteCaution.vue -->
<div v-for="error of displayErrors" :key="error" :class="$style.root">
	<i :class="$style.icon" class="ti ti-alert-triangle"></i>{{ i18n.ts._processErrors[error] ?? error }}
</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	errors?: string[] | null;
}>();

const displayErrors = computed<Iterable<string>>(() => {
	if (!props.errors?.length) return [];

	// Set constructor preserve order, so we can sort first to avoid a copy operation.
	return new Set(props.errors.toSorted());
});
</script>

<style module lang="scss">
.root {
	font-size: 0.8em;
	padding: 16px;
	background: color-mix(in srgb, var(--MI_THEME-infoWarnBg) 65%, transparent);
	color: var(--MI_THEME-infoWarnFg);
	border-radius: var(--MI-radius);
	overflow: clip;
	z-index: 1;
}

.icon {
	margin-right: 8px;
}
</style>
