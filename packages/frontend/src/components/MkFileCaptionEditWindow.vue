<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="9999"
	:height="9999"
	:withOkButton="true"
	:withCloseButton="true"
	:okButtonDisabled="false"
	@ok="ok()"
	@close="dialog?.close()"
	@closed="emit('closed')"
>
	<template #header>{{ i18n.ts.describeFile }}</template>
	<div class="container">
		<div class="fullwidth top-caption">
			<div class="mk-dialog">
				<MkTextarea v-model="caption" autofocus autosize :placeholder="i18n.ts.inputNewDescription" @keydown="onKeydown($event)">
					<template #label>{{ i18n.ts.caption }}</template>
				</MkTextarea>
			</div>
		</div>
		<div class="fullwidth img-container">
			<header>{{ file.name }}</header>
			<img
				id="imgtocaption"
				:src="file.url"
				:alt="file.comment || undefined"
				:title="file.comment || undefined"
			/>
			<footer>
				<span>{{ file.type }}</span>
				<span>{{ bytes(file.size) }}</span>
				<span v-if="file.properties && file.properties.width">
					{{ Number(file.properties.width) }}px × {{ Number(file.properties.height) }}px
				</span>
			</footer>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { shallowRef, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import bytes from '@/filters/bytes.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	file: Misskey.entities.DriveFile;
	default: string;
}>();

const emit = defineEmits<{
	(ev: 'done', v: string): void;
	(ev: 'closed'): void;
}>();

const dialog = shallowRef<InstanceType<typeof MkModalWindow>>();

const caption = ref(props.default);

function onKeydown(ev: KeyboardEvent) {
	if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) ok();

	if (ev.key === 'Escape') {
		emit('closed');
		dialog.value?.close();
	}
}

async function ok() {
	emit('done', caption.value);
	dialog.value?.close();
}
</script>

<style lang="scss" scoped>
.container {
	display: flex;
	inline-size: 100%;
	block-size: calc(100% - 50px);
	flex-direction: row;
	overflow: scroll;
	position: fixed;
	inset-inline-start: 0;
	inset-block-start: 50px;
}
// TODO: use logical property (max-inline-size doesn't work)
@media (max-width: 850px) {
	.container {
		flex-direction: column;
	}
	.top-caption {
		padding-block-end: 8px;
	}
}
.fullwidth {
	inline-size: 100%;
	margin: auto;
}
.mk-dialog {
	position: relative;
	padding: 32px;
	min-inline-size: 320px;
	max-inline-size: 480px;
	box-sizing: border-box;
	text-align: center;
	margin: auto;

	> header {
		margin-block-start: 0;
		margin-inline-end: 0;
		margin-block-end: 8px;
		margin-inline-start: 0;
		position: relative;

		> .title {
			font-weight: bold;
			font-size: 20px;
		}

		> .text-count {
			opacity: 0.7;
			position: absolute;
			inset-inline-end: 0;
		}
	}

	> .buttons {
		margin-block-start: 16px;

		> * {
			margin-block: 0;
			margin-inline: 8px;
		}
	}

	::v-deep(textarea) {
		max-height: calc(-300px + 100vh);
	}
}
.img-container {
	display: flex;
	flex-direction: column;
	block-size: 100%;

	> header,
	> footer {
		align-self: center;
		display: inline-block;
		padding-block: 6px;
		padding-inline: 9px;
		font-size: 90%;
		background: rgba(0, 0, 0, 0.5);
		border-radius: 6px;
		color: #fff;
	}

	> header {
		margin-block-end: 8px;
		opacity: 0.9;
	}

	> img {
		display: block;
		flex: 1;
		min-block-size: 0;
		object-fit: contain;
		inline-size: 100%;
		cursor: zoom-out;
		image-orientation: from-image;
	}

	> footer {
		margin-block-start: 8px;
		opacity: 0.8;

		> span + span {
			margin-inline-start: 0.5em;
			padding-inline-start: 0.5em;
			border-inline-start: solid 1px rgba(255, 255, 255, 0.5);
		}
	}
}
</style>
