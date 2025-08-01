<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

Selectable entry on the "Following" feed, displaying a user with their most recent note.
-->

<template>
<div v-if="!hardMuted" :class="$style.root" @click="$emit('select', note.user)">
	<div :class="$style.avatar">
		<MkAvatar :class="$style.icon" :user="note.user" indictor/>
	</div>
	<div :class="$style.contents">
		<header :class="$style.header">
			<MkA v-user-preview="note.user.id" :class="$style.headerName" :to="userPage(note.user)">
				<MkUserName :user="note.user"/>
			</MkA>
			<MkA :to="notePage(note)">
				<MkTime :time="note.createdAt" :class="$style.headerTime" colored/>
			</MkA>
		</header>
		<div>
			<div v-if="muted || threadMuted || noteMuted" :class="[$style.text, $style.muted]">
				<SkMutedNote :muted="muted" :threadMuted="threadMuted" :noteMuted="noteMuted" :note="note"></SkMutedNote>
			</div>
			<Mfm v-else :class="$style.text" :text="getNoteSummary(note)" :isBlock="true" :plain="true" :nowrap="false" :isNote="true" nyaize="respect" :author="note.user"/>
		</div>
	</div>
</div>
<div v-else>
	<!--
		MkDateSeparatedList uses TransitionGroup which requires single element in the child elements
		so MkNote create empty div instead of no elements
	-->
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { computed } from 'vue';
import { getNoteSummary } from '@/utility/get-note-summary.js';
import { userPage } from '@/filters/user.js';
import { notePage } from '@/filters/note.js';
import { checkMutes } from '@/utility/check-word-mute';
import SkMutedNote from '@/components/SkMutedNote.vue';

const props = defineProps<{
	note: Misskey.entities.Note,
}>();

defineEmits<{
	(event: 'select', user: Misskey.entities.UserLite): void
}>();

const { muted, hardMuted, threadMuted, noteMuted } = checkMutes(computed(() => props.note));
</script>

<style lang="scss" module>
.root {
	position: relative;
	box-sizing: border-box;
	padding: 12px 16px;
	font-size: 0.9em;
	overflow-wrap: break-word;
	display: flex;
	contain: content;
	cursor: pointer;
}

.avatar {
	align-self: center;
	flex-shrink: 0;
	width: 42px;
	height: 42px;
	margin-right: 8px;
}

.contents {
	flex: 1;
	min-width: 0;
}

.header {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	white-space: nowrap;
}

.headerName {
	text-overflow: ellipsis;
	white-space: nowrap;
	min-width: 0;
	overflow: hidden;
	font-weight: bold;
}

.headerTime {
	margin-left: auto;
	font-size: 0.9em;
}

.icon {
	display: block;
	width: 100%;
	height: 100%;
}

.text {
	display: flex;
	width: 100%;
	overflow: clip;
	line-height: 1.25em;
	height: 2.5em;
}

.muted {
	font-style: italic;
}

@container (max-width: 600px) {
	.root {
		padding: 16px;
		font-size: 0.9em;
	}
}

@container (max-width: 500px) {
	.root {
		padding: 12px;
		font-size: 0.85em;
	}
}
</style>
