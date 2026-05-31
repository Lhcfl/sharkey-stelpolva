<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<time :title="absolute" :class="{ [$style.old1]: colored && (secondsAgo > 60 * 60 * 24 * 90), [$style.old2]: colored && (secondsAgo > 60 * 60 * 24 * 180) }">
	<template v-if="isNever">{{ i18n.ts._ago.never }}</template>
	<template v-else-if="isInvalid">{{ i18n.ts._ago.invalid }}</template>
	<template v-else-if="mode === 'relative'">{{ relative }}</template>
	<template v-else-if="mode === 'absolute'">{{ absolute }}</template>
	<template v-else-if="mode === 'detail'">{{ absolute }} ({{ relative }})</template>
</time>
</template>

<script lang="ts" setup>
import isChromatic from 'chromatic/isChromatic';
import { onMounted, onUnmounted, ref, computed, watch, useId } from 'vue';
import { dateTimeFormat } from '@@/js/intl-const.js';
import { breakTime, getRelativeTime, OneSecond, timeBreakpoints } from '@@/js/format-time-string.js';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	time: Date | string | number | null;
	origin?: Date | null;
	mode?: 'relative' | 'absolute' | 'detail';
	colored?: boolean;
	dateOnly?: boolean;
}>(), {
	origin: isChromatic() ? () => new Date('2023-04-01T00:00:00Z') : null,
	mode: 'relative',
	dateOnly: false,
});

const componentId = useId();
const mounted = ref(false);
const intervalId = ref<number | undefined>(undefined);
const intervalValue = ref<number | undefined>(undefined);

const realDate = computed(() => {
	let date = props.time;

	if (date == null) {
		return null;
	}

	if (typeof(date) === 'number') {
		if (Number.isNaN(date)) return null;
		if (!Number.isFinite(date)) return null;
		if (date < 0) return null;
	}

	if (!(date instanceof Date)) {
		try {
			date = new Date(date);
		} catch {
			return null;
		}
	}

	// Invalid dates may produce NaN instead of throwing in the constructor
	if (Number.isNaN(date.getTime())) {
		return null;
	}

	return date;
});

const realNow = ref(new Date());

const now = computed(() => {
	let value = props.origin ?? realNow.value;
	if (props.dateOnly) {
		value = new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDay());
	}
	return value;
});

const date = computed(() => {
	let value = realDate.value;
	if (value && props.dateOnly) {
		value = new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDay());
	}
	return value;
});

const isNever = computed(() => !props.time);
const isInvalid = computed(() => props.time && !date.value);
const isValid = computed(() => !isNever.value && !isInvalid.value);

const absolute = computed<string>(() => {
	if (date.value == null) return i18n.ts._ago.invalid;

	return dateTimeFormat.format(date.value);
});

const relative = computed<string>(() => {
	if (props.mode === 'absolute') return ''; // absoluteではrelativeを使わないので計算しない
	if (isNever.value) return i18n.ts._ago.never;
	if (isInvalid.value) return i18n.ts._ago.invalid;
	if (date.value == null) return '';

	return getRelativeTime({ then: date.value, now: now.value });
});

/**
 * Number of milliseconds that have passed since the input time .
 * Positive if input is in the past (time < now), negative if input is in the future (time > now).
 * Returns zero is input is now (time === now) or invalid.
 */
const millisAgo = computed(() => {
	if (!isValid.value || !date.value) return 0;
	return now.value.getTime() - date.value.getTime();
});
const secondsAgo = computed(() => Math.round(millisAgo.value / 1000));

const tickInterval = computed<number>(() => {
	// Absolute mode doesn't show relative time
	if (props.mode === 'absolute') return -1;

	// Fixed origin means relative time won't change
	if (props.origin) return -1;

	// Invalid input won't be shown
	if (!isValid.value) return -1;

	// Unmounted component won't be shown
	if (!mounted.value) return -1;

	// number of milliseconds between "now" and the specified time.
	const absAgo = Math.abs(millisAgo.value);

	// Following steps implement a dynamic step-down algorithm.
	// It's messy and complicated, but really all it's doing is determining the maximum time we can wait without "missing" a necessary update.
	// This allows the component to dynamically update relative time strings, but without wasting browser time on unnecessary updates.

	// 1. Find the breakpoint for the time.
	const bp = breakTime(absAgo);

	// 2. Calculate the time until that breakpoint is reached.
	const bpAt = absAgo - timeBreakpoints[bp];
	if (bpAt > absAgo) {
		console.warn(`assertion failed: bpAt(${bpAt}) > absAgo(${absAgo})`);
	}

	// 3. Find the breakpoint for *that* time.
	const bpAfter = breakTime(bpAt);

	// 4. Tick on the smaller breakpoint to make sure we don't "miss" the transition from bp to bpAfter.
	const bpAfterAt = timeBreakpoints[bpAfter];
	if (bpAfterAt > bpAt) {
		console.warn(`assertion failed: bpAfterAt(${bpAfterAt}} > bpAt(${bpAt})`);
	}

	// 5. But enforce a minimum time to avoid rapid ticks as we approach zero.
	let interval = Math.max(bpAfterAt, OneSecond);

	// 6. Also enforce *maximum* time to avoid infinite loops on browsers.
	//    https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout#maximum_delay_value
	interval = Math.min(interval, 2147483647); // 2^31 (signed)

	// 7. And finally, make sure an invalid value didn't slip through
	if (!Number.isFinite(interval)) {
		interval = -1;
	}

	return interval;
});

function onTick() {
	// Update time value
	realNow.value = new Date();
}

watch(tickInterval, (interval) => {
	// stop interval
	if (interval < 1) {
		window.clearInterval(intervalId.value);
		intervalId.value = undefined;
		intervalValue.value = undefined;
		return;
	}

	// start interval
	if (!intervalId.value) {
		intervalId.value = window.setInterval(onTick, tickInterval.value);
		intervalValue.value = tickInterval.value;
		return;
	}

	// change interval
	if (interval !== intervalValue.value) {
		window.clearInterval(intervalId.value);
		intervalId.value = window.setInterval(onTick, tickInterval.value);
		intervalValue.value = tickInterval.value;
	}

	// keep interval
	// (noop)
});

onMounted(() => {
	mounted.value = true;
});

onUnmounted(() => {
	mounted.value = false;
});
</script>

<style lang="scss" module>
.old1 {
	color: var(--MI_THEME-warn);
}

.old1.old2 {
	color: var(--MI_THEME-error);
}
</style>
