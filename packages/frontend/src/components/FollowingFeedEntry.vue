<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" @click="$emit('select', note.userId)">
	<div :class="$style.head">
		<MkAvatar :class="$style.icon" :user="note.user" indictor/>
	</div>
	<div :class="$style.tail">
		<header :class="$style.header">
			<MkA v-user-preview="note.user.id" :class="$style.headerName" :to="userPage(note.user)">
				<MkUserName :user="note.user"/>
			</MkA>
			<MkA :to="notePage(note)">
				<MkTime :time="note.createdAt" :class="$style.headerTime" colored/>
			</MkA>
		</header>
		<div>
			<Mfm :class="$style.text" :text="getNoteSummary(note)" :isBlock="false" :plain="true" :nowrap="false" :isNote="true" :author="note.user"/>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { getNoteSummary } from '@/scripts/get-note-summary.js';
import { userPage } from '@/filters/user.js';
import { notePage } from '@/filters/note.js';

defineProps<{
	note: Misskey.entities.Note
}>();

defineEmits<{
	(event: 'select', userId: string): void
}>();

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
}

.head {
	align-self: center;
	flex-shrink: 0;
	width: 42px;
	height: 42px;
	margin-right: 8px;
}

.tail {
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
