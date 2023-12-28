<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="400"
	:height="500"
	:withOkButton="true"
	:okButtonDisabled="false"
	@ok="ok()"
	@close="dialog.close()"
	@closed="emit('closed')"
>
	<template #header>{{ i18n.ts.describeFile }}</template>
	<MkSpacer :marginMin="20" :marginMax="28">
		<MkDriveFileThumbnail :file="file" fit="contain" style="height: 193px; margin-bottom: 16px;"/>
		<MkTextarea v-model="caption" autofocus :placeholder="i18n.ts.inputNewDescription">
			<template #label>{{ i18n.ts.caption }}</template>
		</MkTextarea>
		<div v-if="canOcr" :class="$style.ocr">
			<span :class="$style.ocrHeader">{{ i18n.ts._ocr.header }}</span>
			<div :class="$style.ocrForm">
				<MkSelect v-model="ocrLanguage">
					<option v-for="language in ocrLanguages" :key="language" :value="language">{{ i18n.ts._ocr.languages[language] ?? language }}</option>
				</MkSelect>
				<MkButton @click="onOCR">{{ i18n.ts._ocr.button }}</MkButton>
			</div>
		</div>
	</MkSpacer>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { shallowRef, ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import * as ocrLanguages from 'tesseract.js/src/constants/languages.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { defaultStore } from '@/store.js';

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

// https://github.com/naptha/tesseract.js/blob/master/docs/image-format.md
const OCR_SUPPORTED_FILETYPES = ['image/bmp', 'image/jpeg', 'image/png', 'image/webp'];

const canOcr = computed(() => OCR_SUPPORTED_FILETYPES.includes(props.file.type));
const ocrLanguage = ref('eng');

async function ok() {
	emit('done', caption.value);
	dialog.value.close();
}

async function onOCR() {
	if (caption.value) {
		const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._ocr.existingWarning });
		if (canceled) {
			return;
		}
	}

	// as there isn't a generic data saver option this is the next best thing.
	// unsure if i should introduce a separate dataSaver option
	// unsure if this is *truly* necessary. the models are just a handful of megabytes
	if (defaultStore.state.dataSaver.media) {
		const { canceled } = await os.confirm({ type: 'warning', title: i18n.ts.dataSaver, text: i18n.ts._ocr.dataWarning });
		if (canceled) {
			return;
		}
	}

	await os.promiseDialog((async () => {
		const tesseract = await import('tesseract.js');
		const worker = await tesseract.createWorker(ocrLanguage.value, undefined, {
			// future improvement: it should be possible to use this logger function to provide a progress bar (via the m.progress property)
			logger(m) { console.log('[OCR]', m); },
			workerPath: '/assets/tesseract/worker.min.js',
			corePath: '/assets/tesseract/core',
			workerBlobURL: false, // csp
			legacyCore: false,
			legacyLang: false,
		});

		const result = await worker.recognize(props.file.url);
		caption.value = result.data.text;
		await worker.terminate(); // potential future optimization: hang on to the worker for a few minutes and reuse just in case user runs multiple OCRs
	})(), null, (err) => os.alert({ type: 'error', text: err.message }));
}
</script>

<style lang="scss" module>
.ocr {
	margin-top: 8px;
}

.ocrHeader {
	display: block;
	margin-bottom: 2px;
	font-size: 0.85em;
	user-select: none;
}

.ocrForm {
	display: flex;
	gap: 8px;

	> select {
		flex-grow: 1;
	}
}
</style>
