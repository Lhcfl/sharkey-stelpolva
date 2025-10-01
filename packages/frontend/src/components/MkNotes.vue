<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkPagination ref="pagingComponent" :pagination="pagination" :disableAutoLoad="disableAutoLoad">
	<template #empty><MkResult type="empty" :text="i18n.ts.noNotes"/></template>

	<template #default="{ items: notes }">
		<div :class="[$style.root, { [$style.noGap]: noGap, '_gaps': !noGap, [$style.reverse]: pagination.reversed }]">
			<template v-for="(note, i) in notes" :key="note.id">
				<DynamicNote :class="$style.note" :note="note as Misskey.entities.Note" :withHardMute="true" :data-scroll-anchor="note.id" @expandMute="n => emit('expandMute', n)"/>
				<MkAd v-if="note._shouldInsertAd_" :preferForms="['horizontal', 'horizontal-big']" :class="$style.ad"/>
			</template>
		</div>
	</template>
</MkPagination>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { useTemplateRef } from 'vue';
import type { Paging } from '@/components/MkPagination.vue';
import DynamicNote from '@/components/DynamicNote.vue';
import MkPagination from '@/components/MkPagination.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	pagination: Paging;
	noGap?: boolean;
	disableAutoLoad?: boolean;
}>();

const pagingComponent = useTemplateRef('pagingComponent');

defineExpose({
	pagingComponent,
});

const emit = defineEmits<{
	(ev: 'expandMute', note: Misskey.entities.Note): void;
}>();
</script>

<style lang="scss" module>
.reverse {
	display: flex;
	flex-direction: column-reverse;
}

.root {
	container-type: inline-size;

	&.noGap {
		background: color-mix(in srgb, var(--MI_THEME-panel) 65%, transparent);

		.note:not(:empty) {
			border-bottom: solid 0.5px var(--MI_THEME-divider);
		}

		.ad {
			padding: 8px;
			background-size: auto auto;
			background-image: repeating-linear-gradient(45deg, transparent, transparent 8px, var(--MI_THEME-bg) 8px, var(--MI_THEME-bg) 14px);
			border-bottom: solid 0.5px var(--MI_THEME-divider);
		}
	}

	&:not(.noGap) {
		background: var(--MI_THEME-bg);

		.note {
			background: color-mix(in srgb, var(--MI_THEME-panel) 65%, transparent);
			border-radius: var(--MI-radius);
		}
	}
}

.ad:empty {
	display: none;
}
</style>
