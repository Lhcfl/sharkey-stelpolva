<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root">
	<div v-if="!showing" :class="$style.placeholder"></div>
	<slot v-else></slot>
</div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, onActivated, onBeforeUnmount, ref, useTemplateRef } from 'vue';

const rootEl = useTemplateRef('rootEl');
const showing = ref(false);

defineExpose({ rootEl, showing });

const emit = defineEmits<{
	(ev: 'show'): void,
}>();

const observer = new IntersectionObserver(
	(entries) => {
		if (entries.some((entry) => entry.isIntersecting)) {
			showing.value = true;

			// Disconnect to avoid observer soft-leaks
			observer.disconnect();

			// Notify containing element to trigger edge logic
			emit('show');
		}
	},
);

onMounted(() => {
	nextTick(() => {
		if (rootEl.value) {
			observer.observe(rootEl.value);
		}
	});
});

onActivated(() => {
	nextTick(() => {
		if (rootEl.value) {
			observer.observe(rootEl.value);
		}
	});
});

onBeforeUnmount(() => {
	observer.disconnect();
});
</script>

<style lang="scss" module>
.root {
	display: block;
}

.placeholder {
	display: block;
	min-height: 150px;
}
</style>
