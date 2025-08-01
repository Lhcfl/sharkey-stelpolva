<!--
SPDX-FileCopyrightText: dakkar, MoshiBar, and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

Renders a KaTeX formula.
-->

<template>
<div v-if="block" :class="$style.block" v-html="renderedFormula"></div>
<span v-else v-html="renderedFormula"></span>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const props = defineProps<{
		formula: string;
		block: boolean;
	}>();

const renderedFormula = computed(() =>
	katex.renderToString(props.formula, {
		throwOnError: false,
		trust: false,
		displayMode: props.block,
	}));
</script>

<style lang="scss" module>
	.block {
		text-align: center;
	}
</style>
