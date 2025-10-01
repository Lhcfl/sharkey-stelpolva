<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

Displays a placeholder for a muted note.
-->

<template>
<div ref="rootEl" :class="rootClass">
	<!-- The actual note (or whatever we're wrapping) will render here. -->
	<slot v-if="isExpanded"></slot>

	<!-- If hard muted, we want to hide *everything*, including the placeholders and controls to expand. -->
	<div v-else-if="!mute.hardMuted" :class="[$style.muted, $style.muteContainer, mutedClass]" @click.stop="expand">
		<!-- Mandatory CWs -->
		<I18n v-if="mute.noteMandatoryCW" :src="i18n.ts.noteIsFlaggedAs" tag="small">
			<template #cw>
				{{ mute.noteMandatoryCW }}
			</template>
		</I18n>
		<I18n v-if="mute.userMandatoryCW" :src="i18n.ts.userIsFlaggedAs" tag="small">
			<template #name>
				{{ userName }}
			</template>
			<template #cw>
				{{ mute.userMandatoryCW }}
			</template>
		</I18n>
		<I18n v-if="mute.instanceMandatoryCW" :src="i18n.ts.instanceIsFlaggedAs" tag="small">
			<template #name>
				{{ instanceName }}
			</template>
			<template #cw>
				{{ mute.instanceMandatoryCW }}
			</template>
		</I18n>

		<!-- Muted notes/threads -->
		<I18n v-if="mute.noteMuted" :src="i18n.ts.userSaysSomethingInMutedNote" tag="small">
			<template #name>
				{{ userName }}
			</template>
		</I18n>
		<I18n v-else-if="mute.threadMuted" :src="i18n.ts.userSaysSomethingInMutedThread" tag="small">
			<template #name>
				{{ userName }}
			</template>
		</I18n>

		<!-- Silenced users/instances -->
		<I18n v-if="mute.userSilenced" :src="i18n.ts.silencedUserSaysSomething" tag="small">
			<template #name>
				{{ userName }}
			</template>
			<template #host>
				{{ host }}
			</template>
		</I18n>
		<I18n v-if="mute.instanceSilenced" :src="i18n.ts.silencedInstanceSaysSomething" tag="small">
			<template #name>
				{{ instanceName }}
			</template>
			<template #host>
				{{ host }}
			</template>
		</I18n>

		<!-- Word mutes -->
		<template v-if="mutedWords">
			<I18n v-if="prefer.s.showSoftWordMutedWord" :src="i18n.ts.userSaysSomethingAbout" tag="small">
				<template #name>
					{{ userName }}
				</template>
				<template #word>
					{{ mutedWords }}
				</template>
			</I18n>
			<I18n v-else :src="i18n.ts.userSaysSomething" tag="small">
				<template #name>
					{{ userName }}
				</template>
			</I18n>
		</template>

		<!-- Sensitive mute -->
		<I18n v-if="mute.sensitiveMuted" :src="i18n.ts.userSaysSomethingSensitive" tag="small">
			<template #name>
				{{ userName }}
			</template>
		</I18n>

		<!-- Stelpolva Patch -->
		<I18n v-if="mute.stpvMute.reason === 'noteMuted'" :src="i18n.ts.userSaysSomethingInMutedNote" tag="small">
			<template #name>
				{{ userName }}
			</template>
		</I18n>
		<I18n v-else-if="mute.stpvMute.reason === 'authorMuted'" :src="i18n.ts.userSaysSomething" tag="small">
			<template #name>
				{{ userName }}
			</template>
		</I18n>
		<I18n v-else-if="mute.stpvMute.reason === 'domainMuted'" :src="i18n.ts.stpvDomainUserSaysSomething" tag="small">
			<template #name>
				{{ userName }}
			</template>
			<template #domain>
				{{ mute.stpvMute.detail }}
			</template>
		</I18n>
	</div>
</div>
</template>

<script setup lang="ts">
import * as Misskey from 'misskey-js';
import { computed, ref, useTemplateRef } from 'vue';
import { host } from '@@/js/config.js';
import type { Ref } from 'vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { checkMute } from '@/utility/check-word-mute.js';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	withHardMute?: boolean;
	mutedClass?: string | string[] | Record<string, boolean> | (string | string[] | Record<string, boolean>)[];
	expandedClass?: string | string[] | Record<string, boolean> | (string | string[] | Record<string, boolean>)[];
	skipMute?: boolean;
}>(), {
	withHardMute: true,
	mutedClass: undefined,
	expandedClass: undefined,
	skipMute: false,
});

const emit = defineEmits<{
	(type: 'expandMute', note: Misskey.entities.Note): void;
}>();

const expandNote = ref(false);

function expand() {
	expandNote.value = true;
	emit('expandMute', props.note);
}

const mute = checkMute(
	computed(() => props.note),
	computed(() => props.withHardMute),
	computed(() => prefer.s.uncollapseCW),
);

const mutedWords = computed(() => mute.value.softMutedWords?.join(', '));
const isExpanded = computed(() => props.skipMute || expandNote.value || !mute.value.hasMute);
const rootClass = computed(() => isExpanded.value ? props.expandedClass : undefined);

const userName = computed(() => props.note.user.host
	? `@${props.note.user.username}@${props.note.user.host}`
	: `@${props.note.user.username}`);
const instanceName = computed(() => props.note.user.host ?? host);

const rootEl = useTemplateRef('rootEl');
defineExpose({
	rootEl: rootEl as Ref<HTMLElement | null>,
});
</script>

<style module lang="scss">
.muted {
	padding: 8px;
	text-align: center;
	opacity: 0.7;
	cursor: pointer;

	// Without this, the mute placeholder collapses weirdly when the note is rendered in a flax container.
	flex: 1;
}

.muted:hover {
	background: var(--MI_THEME-buttonBg);
}

.muteContainer > :not(:first-child) {
	margin-left: 0.75rem;

	&:before {
		content: "•";
		margin-right: 0.75rem;
		font-size: 1rem;
	}
}
</style>
