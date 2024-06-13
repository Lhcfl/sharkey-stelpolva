<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.collapsed]: collapsed }]">
	<div :class="{ [$style.clickToOpen]: defaultStore.state.clickToOpen }" @click.stop="defaultStore.state.clickToOpen ? noteclick(note.id) : undefined">
		<span v-if="note.isHidden" style="opacity: 0.5">({{ i18n.ts.private }})</span>
		<span v-if="note.deletedAt" style="opacity: 0.5">({{ i18n.ts.deletedNote }})</span>
		<MkA v-if="note.replyId" :class="$style.reply" :to="`/notes/${note.replyId}`" @click.stop><i class="ph-arrow-bend-left-up ph-bold ph-lg"></i></MkA>
		<Mfm v-if="note.text" :text="note.text" :isBlock="true" :author="note.user" :nyaize="'respect'" :isAnim="allowAnim" :emojiUrls="note.emojis"/>
		<MkButton v-if="!allowAnim && animated && !hideFiles" :class="$style.playMFMButton" :small="true" @click="animatedMFM()" @click.stop><i class="ph-play ph-bold ph-lg "></i> {{ i18n.ts._animatedMFM.play }}</MkButton>
		<MkButton v-else-if="!defaultStore.state.animatedMfm && allowAnim && animated && !hideFiles" :class="$style.playMFMButton" :small="true" @click="animatedMFM()" @click.stop><i class="ph-stop ph-bold ph-lg "></i> {{ i18n.ts._animatedMFM.stop }}</MkButton>
		<div v-if="note.text && translating || note.text && translation" :class="$style.translation">
			<MkLoading v-if="translating" mini/>
			<div v-else>
				<b>{{ i18n.tsx.translatedFrom({ x: translation.sourceLang }) }}: </b>
				<Mfm :text="translation.text" :isBlock="true" :author="note.user" :nyaize="'respect'" :emojiUrls="note.emojis"/>
			</div>
		</div>
		<MkA v-if="note.renoteId" :class="$style.rp" :to="`/notes/${note.renoteId}`" @click.stop>RN: ...</MkA>
	</div>
	<details v-if="note.files && note.files.length > 0" :open="!defaultStore.state.collapseFiles && !hideFiles">
		<summary>({{ i18n.tsx.withNFiles({ n: note.files.length }) }})</summary>
		<MkMediaList :mediaList="note.files"/>
	</details>
	<details v-if="note.poll">
		<summary>{{ i18n.ts.poll }}</summary>
		<MkPoll :noteId="note.id" :poll="note.poll"/>
	</details>
	<button v-if="isLong && collapsed" :class="$style.fade" class="_button" @click.stop="collapsed = false">
		<span :class="$style.fadeLabel">{{ i18n.ts.showMore }}</span>
	</button>
	<button v-else-if="isLong && !collapsed" :class="$style.showLess" class="_button" @click.stop="collapsed = true">
		<span :class="$style.showLessLabel">{{ i18n.ts.showLess }}</span>
	</button>
</div>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import * as Misskey from 'misskey-js';
import * as mfm from '@transfem-org/sfm-js';
import MkMediaList from '@/components/MkMediaList.vue';
import MkPoll from '@/components/MkPoll.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { shouldCollapsed } from '@/scripts/collapsed.js';
import { defaultStore } from '@/store.js';
import { useRouter } from '@/router/supplier.js';
import * as os from '@/os.js';
import { checkAnimationFromMfm } from '@/scripts/check-animated-mfm.js';

const props = defineProps<{
	note: Misskey.entities.Note;
	translating?: boolean;
	translation?: any;
	hideFiles?: boolean;
	expandAllCws?: boolean;
}>();

const router = useRouter();

function noteclick(id: string) {
	const selection = document.getSelection();
	if (selection?.toString().length === 0) {
		router.push(`/notes/${id}`);
	}
}

const parsed = computed(() => props.note.text ? mfm.parse(props.note.text) : null);
const animated = computed(() => parsed.value ? checkAnimationFromMfm(parsed.value) : null);
let allowAnim = ref(defaultStore.state.advancedMfm && defaultStore.state.animatedMfm ? true : false);

const isLong = defaultStore.state.expandLongNote && !props.hideFiles ? false : shouldCollapsed(props.note, []);

function animatedMFM() {
	if (allowAnim.value) {
		allowAnim.value = false;
	} else {
		os.confirm({
			type: 'warning',
			text: i18n.ts._animatedMFM._alert.text,
			okText: i18n.ts._animatedMFM._alert.confirm,
		}).then((res) => { if (!res.canceled) allowAnim.value = true; });
	}
}

const collapsed = ref(isLong);

watch(() => props.expandAllCws, (expandAllCws) => {
	if (expandAllCws) collapsed.value = false;
});
</script>

<style lang="scss" module>
.root {
	overflow-wrap: break-word;

	&.collapsed {
		position: relative;
		max-height: 9em;
		overflow: clip;

		> .fade {
			display: block;
			position: absolute;
			bottom: 0;
			left: 0;
			width: 100%;
			height: 64px;
			//background: linear-gradient(0deg, var(--panel), var(--X15));

			> .fadeLabel {
				display: inline-block;
				background: var(--panel);
				padding: 6px 10px;
				font-size: 0.8em;
				border-radius: var(--radius-ellipse);
				box-shadow: 0 2px 6px rgb(0 0 0 / 20%);
			}

			&:hover {
				> .fadeLabel {
					background: var(--panelHighlight);
				}
			}
		}
	}
}

.reply {
	margin-right: 6px;
	color: var(--accent);
}

.rp {
	margin-left: 4px;
	font-style: oblique;
	color: var(--renote);
}

.translation {
	border: solid 0.5px var(--divider);
	border-radius: var(--radius);
	padding: 12px;
	margin-top: 8px;
}

.showLess {
	width: 100%;
	margin-top: 14px;
	position: sticky;
	bottom: calc(var(--stickyBottom, 0px) - 100px);
}

.playMFMButton {
	margin-top: 5px;
}

.showLessLabel {
	display: inline-block;
	background: var(--popup);
	padding: 6px 10px;
	font-size: 0.8em;
	border-radius: var(--radius-ellipse);
	box-shadow: 0 2px 6px rgb(0 0 0 / 20%);
}

.clickToOpen {
	cursor: pointer;
	-webkit-tap-highlight-color: transparent;
}
</style>
