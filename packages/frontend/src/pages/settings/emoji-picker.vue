<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<MkFolder :defaultOpen="true">
		<template #icon><i class="ph-pin ph-bold ph-lg"></i></template>
		<template #label>{{ i18n.ts.pinned }} ({{ i18n.ts.reaction }})</template>
		<template #caption>{{ i18n.ts.pinnedEmojisForReactionSettingDescription }}</template>

		<div class="_gaps">
			<div>
				<div v-panel style="border-radius: var(--radius-sm);">
					<Sortable
						v-model="pinnedEmojisForReaction"
						:class="$style.emojis"
						:itemKey="item => item"
						:animation="150"
						:delay="100"
						:delayOnTouchOnly="true"
					>
						<template #item="{element}">
							<button class="_button" :class="$style.emojisItem" @click="removeReaction(element, $event)">
								<MkCustomEmoji v-if="element[0] === ':'" :name="element" :normal="true"/>
								<MkEmoji v-else :emoji="element" :normal="true"/>
							</button>
						</template>
						<template #footer>
							<button class="_button" :class="$style.emojisAdd" @click="chooseReaction">
								<i class="ph-plus ph-bold ph-lg"></i>
							</button>
						</template>
					</Sortable>
				</div>
				<div :class="$style.editorCaption">{{ i18n.ts.reactionSettingDescription2 }}</div>
			</div>

			<div class="_buttons">
				<MkButton inline @click="previewReaction"><i class="ph-eye ph-bold ph-lg"></i> {{ i18n.ts.preview }}</MkButton>
				<MkButton inline danger @click="setDefaultReaction"><i class="ph-arrow-counter-clockwise ph-bold ph-lg"></i> {{ i18n.ts.default }}</MkButton>
				<MkButton inline danger @click="overwriteFromPinnedEmojis"><i class="ph-copy ph-bold ph-lg"></i> {{ i18n.ts.overwriteFromPinnedEmojis }}</MkButton>
			</div>
		</div>
	</MkFolder>

	<MkFolder>
		<template #icon><i class="ph-pin ph-bold ph-lg"></i></template>
		<template #label>{{ i18n.ts.pinned }} ({{ i18n.ts.general }})</template>
		<template #caption>{{ i18n.ts.pinnedEmojisSettingDescription }}</template>

		<div class="_gaps">
			<div>
				<div v-panel style="border-radius: var(--radius-sm);">
					<Sortable
						v-model="pinnedEmojis"
						:class="$style.emojis"
						:itemKey="item => item"
						:animation="150"
						:delay="100"
						:delayOnTouchOnly="true"
					>
						<template #item="{element}">
							<button class="_button" :class="$style.emojisItem" @click="removeEmoji(element, $event)">
								<MkCustomEmoji v-if="element[0] === ':'" :name="element" :normal="true"/>
								<MkEmoji v-else :emoji="element" :normal="true"/>
							</button>
						</template>
						<template #footer>
							<button class="_button" :class="$style.emojisAdd" @click="chooseEmoji">
								<i class="ph-plus ph-bold ph-lg"></i>
							</button>
						</template>
					</Sortable>
				</div>
				<div :class="$style.editorCaption">{{ i18n.ts.reactionSettingDescription2 }}</div>
			</div>

			<div class="_buttons">
				<MkButton inline @click="previewEmoji"><i class="ph-eye ph-bold ph-lg"></i> {{ i18n.ts.preview }}</MkButton>
				<MkButton inline danger @click="setDefaultEmoji"><i class="ph-arrow-counter-clockwise ph-bold ph-lg"></i> {{ i18n.ts.default }}</MkButton>
				<MkButton inline danger @click="overwriteFromPinnedEmojisForReaction"><i class="ph-copy ph-bold ph-lg"></i> {{ i18n.ts.overwriteFromPinnedEmojisForReaction }}</MkButton>
			</div>
		</div>
	</MkFolder>

	<FromSlot>
		<template #label>{{ i18n.ts.defaultLike }}</template>
		<MkCustomEmoji v-if="like && like.startsWith(':')" style="max-height: 3em; font-size: 1.1em;" :useOriginalSize="false" :class="$style.reaction" :name="like" :normal="true" :noStyle="true"/>
		<MkEmoji v-else-if="like && !like.startsWith(':')" :emoji="like" style="max-height: 3em; font-size: 1.1em;" :normal="true" :noStyle="true"/>
		<span v-else-if="!like">{{ i18n.ts.notSet }}</span>
		<div class="_buttons" style="padding-top: 8px;">
			<MkButton rounded :small="true" inline @click="chooseNewLike"><i class="ph-smiley ph-bold ph-lg"></i> Change</MkButton>
			<MkButton rounded :small="true" inline @click="resetLike"><i class="ph-arrow-clockwise ph-bold ph-lg"></i> Reset</MkButton>
		</div>
	</FromSlot>

	<FormSection>
		<template #label>{{ i18n.ts.emojiPickerDisplay }}</template>

		<div class="_gaps_m">
			<MkRadios v-model="emojiPickerScale">
				<template #label>{{ i18n.ts.size }}</template>
				<option :value="1">{{ i18n.ts.small }}</option>
				<option :value="2">{{ i18n.ts.medium }}</option>
				<option :value="3">{{ i18n.ts.large }}</option>
			</MkRadios>

			<MkRadios v-model="emojiPickerWidth">
				<template #label>{{ i18n.ts.numberOfColumn }}</template>
				<option :value="1">5</option>
				<option :value="2">6</option>
				<option :value="3">7</option>
				<option :value="4">8</option>
				<option :value="5">9</option>
			</MkRadios>

			<MkRadios v-model="emojiPickerHeight">
				<template #label>{{ i18n.ts.height }}</template>
				<option :value="1">{{ i18n.ts.small }}</option>
				<option :value="2">{{ i18n.ts.medium }}</option>
				<option :value="3">{{ i18n.ts.large }}</option>
				<option :value="4">{{ i18n.ts.large }}+</option>
			</MkRadios>

			<MkSwitch v-model="emojiPickerUseDrawerForMobile">
				{{ i18n.ts.useDrawerReactionPickerForMobile }}
				<template #caption>{{ i18n.ts.needReloadToApply }}</template>
			</MkSwitch>
		</div>
	</FormSection>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, Ref, watch } from 'vue';
import Sortable from 'vuedraggable';
import MkRadios from '@/components/MkRadios.vue';
import MkButton from '@/components/MkButton.vue';
import FormSection from '@/components/form/section.vue';
import FromSlot from '@/components/form/slot.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import * as os from '@/os.js';
import { defaultStore } from '@/store.js';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { deepClone } from '@/scripts/clone.js';
import { reactionPicker } from '@/scripts/reaction-picker.js';
import { emojiPicker } from '@/scripts/emoji-picker.js';
import { unisonReload } from '@/scripts/unison-reload.js';
import MkCustomEmoji from '@/components/global/MkCustomEmoji.vue';
import MkEmoji from '@/components/global/MkEmoji.vue';
import MkFolder from '@/components/MkFolder.vue';

const pinnedEmojisForReaction: Ref<string[]> = ref(deepClone(defaultStore.state.reactions));
const pinnedEmojis: Ref<string[]> = ref(deepClone(defaultStore.state.pinnedEmojis));

const emojiPickerScale = computed(defaultStore.makeGetterSetter('emojiPickerScale'));
const emojiPickerWidth = computed(defaultStore.makeGetterSetter('emojiPickerWidth'));
const emojiPickerHeight = computed(defaultStore.makeGetterSetter('emojiPickerHeight'));
const emojiPickerUseDrawerForMobile = computed(defaultStore.makeGetterSetter('emojiPickerUseDrawerForMobile'));

const removeReaction = (reaction: string, ev: MouseEvent) => remove(pinnedEmojisForReaction, reaction, ev);
const chooseReaction = (ev: MouseEvent) => pickEmoji(pinnedEmojisForReaction, ev);
const setDefaultReaction = () => setDefault(pinnedEmojisForReaction);

const like = computed(defaultStore.makeGetterSetter('like'));

const removeEmoji = (reaction: string, ev: MouseEvent) => remove(pinnedEmojis, reaction, ev);
const chooseEmoji = (ev: MouseEvent) => pickEmoji(pinnedEmojis, ev);
const setDefaultEmoji = () => setDefault(pinnedEmojis);

function previewReaction(ev: MouseEvent) {
	reactionPicker.show(getHTMLElement(ev));
}

function previewEmoji(ev: MouseEvent) {
	emojiPicker.show(getHTMLElement(ev));
}

async function overwriteFromPinnedEmojis() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.overwriteContentConfirm,
	});

	if (canceled) {
		return;
	}

	pinnedEmojisForReaction.value = [...pinnedEmojis.value];
}

async function overwriteFromPinnedEmojisForReaction() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.overwriteContentConfirm,
	});

	if (canceled) {
		return;
	}

	pinnedEmojis.value = [...pinnedEmojisForReaction.value];
}

function remove(itemsRef: Ref<string[]>, reaction: string, ev: MouseEvent) {
	os.popupMenu([{
		text: i18n.ts.remove,
		action: () => {
			itemsRef.value = itemsRef.value.filter(x => x !== reaction);
		},
	}], getHTMLElement(ev));
}

async function setDefault(itemsRef: Ref<string[]>) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.resetAreYouSure,
	});
	if (canceled) return;

	itemsRef.value = deepClone(defaultStore.def.reactions.default);
}

async function pickEmoji(itemsRef: Ref<string[]>, ev: MouseEvent) {
	os.pickEmoji(getHTMLElement(ev), {
		showPinned: false,
	}).then(it => {
		const emoji = it as string;
		if (!itemsRef.value.includes(emoji)) {
			itemsRef.value.push(emoji);
		}
	});
}

async function reloadAsk() {
	const { canceled } = await os.confirm({
		type: 'info',
		text: i18n.ts.reloadToApplySetting,
	});
	if (canceled) return;

	unisonReload();
}

function chooseNewLike(ev: MouseEvent) {
	os.pickEmoji(getHTMLElement(ev), {
		showPinned: false,
	}).then(async emoji => {
		defaultStore.set('like', emoji as string);
		await reloadAsk();
	});
}

async function resetLike() {
	defaultStore.set('like', null);
	await reloadAsk();
}

function getHTMLElement(ev: MouseEvent): HTMLElement {
	const target = ev.currentTarget ?? ev.target;
	return target as HTMLElement;
}

watch(pinnedEmojisForReaction, () => {
	defaultStore.set('reactions', pinnedEmojisForReaction.value);
}, {
	deep: true,
});

watch(pinnedEmojis, () => {
	defaultStore.set('pinnedEmojis', pinnedEmojis.value);
}, {
	deep: true,
});

definePageMetadata({
	title: i18n.ts.emojiPicker,
	icon: 'ph-smiley ph-bold ph-lg',
});
</script>

<style lang="scss" module>
.tab {
	margin: calc(var(--margin) / 2) 0;
	padding: calc(var(--margin) / 2) 0;
	background: var(--bg);
}

.emojis {
  padding: 12px;
  font-size: 1.1em;
}

.emojisItem {
  display: inline-block;
  padding: 8px;
  cursor: move;
}

.emojisAdd {
  display: inline-block;
  padding: 8px;
}

.editorCaption {
	font-size: 0.85em;
	padding: 8px 0 0 0;
	color: var(--fgTransparentWeak);
}
</style>
