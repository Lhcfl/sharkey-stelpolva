<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps" :class="$style.textRoot">
	<Mfm :text="block.text ?? ''" :isBlock="true" :isNote="false"/>
	<div v-if="isEnabledUrlPreview" class="_gaps_s" @click.stop>
		<SkUrlPreviewGroup :sourceText="block.text" :showAsQuote="!page.user.rejectQuotes"/>
	</div>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { isEnabledUrlPreview } from '@/instance.js';
import SkUrlPreviewGroup from '@/components/SkUrlPreviewGroup.vue';

defineProps<{
	block: Misskey.entities.PageBlock,
	page: Misskey.entities.Page,
}>();
</script>

<style lang="scss" module>
.textRoot {
	font-size: 1.1rem;
}
</style>
