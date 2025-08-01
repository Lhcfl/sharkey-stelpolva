<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

List of items, divided by date separators.
-->

<template>
<div class="_gaps">
	<template v-for="(item, index) in timeline" :key="item.id">
		<slot v-if="item.type === 'item'" :id="item.id" :index="index" :item="item.data"></slot>
		<slot v-else-if="item.type === 'date'" :id="item.id" :index="index" :prev="item.prev" :prevText="item.prevText" :next="item.next" :nextText="item.nextText" name="date">
			<div :class="$style.dateDivider">
				<span><i class="ti ti-chevron-up"></i> {{ item.nextText }}</span>
				<span :class="$style.dateSeparator"></span>
				<span>{{ item.prevText }} <i class="ti ti-chevron-down"></i></span>
			</div>
		</slot>
	</template>
</div>
</template>

<script setup lang="ts" generic="T extends { id: string; createdAt: string; }">
import { computed } from 'vue';
import { makeDateSeparatedTimelineComputedRef } from '@/utility/timeline-date-separate';

const props = defineProps<{
	items: T[],
}>();

const itemsRef = computed(() => props.items);
const timeline = makeDateSeparatedTimelineComputedRef(itemsRef);
</script>

<style module lang="scss">
// From room.vue
.dateDivider {
	display: flex;
	font-size: 85%;
	align-items: center;
	justify-content: center;
	gap: 0.5em;
	opacity: 0.75;
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: 999px;
	width: fit-content;
	padding: 0.5em 1em;
	margin: 0 auto;
}

// From room.vue
.dateSeparator {
	height: 1em;
	width: 1px;
	background: var(--MI_THEME-divider);
}
</style>
