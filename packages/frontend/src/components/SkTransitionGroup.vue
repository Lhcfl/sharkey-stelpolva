<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

List of elements, with animations for inserting, removing, and reordering items.

Animation can be disabled with the "reduced animation" preferences.
This component exists because Misskey's implementation of the reduced animation preference tends to break VueJS.
-->

<template>
<TransitionGroup v-if="animate ?? prefer.s.animation" v-bind="props" :class="props.class">
	<slot></slot>
</TransitionGroup>
<component :is="tag" v-else :class="props.class">
	<slot></slot>
</component>
</template>

<script setup lang="ts">
import type { TransitionGroupProps } from 'vue';
import { prefer } from '@/preferences';

// This is a "best guess" type.
// If any valid :class binding produces a type error here, then please change this to match.
type ClassBinding = string | Record<string, boolean | undefined>;

// This can be an inline type, but pulling it out makes TS errors clearer.
interface SkTransitionGroupProps extends TransitionGroupProps {
	/**
	 * Override CSS styles for the TransitionGroup or native element.
	 */
	class?: undefined | ClassBinding | ClassBinding[];

	/**
	 * If true, will render a TransitionGroup.
	 * If false, will render a native element.
	 * If null or undefined (default), will respect the value of prefer.s.animation.
	 */
	animate?: boolean | undefined | null;
}

const props = withDefaults(defineProps<SkTransitionGroupProps>(), {
	tag: 'div',
	class: undefined,
	animate: undefined,
});
</script>
