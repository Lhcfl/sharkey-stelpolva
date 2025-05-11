<!--
SPDX-FileCopyrightText: marie and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkWindow ref="window" :initialWidth="500" :initialHeight="300" :canResize="true" @closed="emit('closed')">
	<template #header>
		<i class="ph-warning-circle ph-bold ph-lg" style="margin-right: 0.5em;"></i>
		<b>Previous Version from {{ dateTimeFormat.format(new Date(appearNote.createdAt)) }}</b>
	</template>
	<div ref="el" :class="$style.root">
		<article :class="$style.note">
			<header :class="$style.noteHeader">
				<MkAvatar :class="$style.noteHeaderAvatar" :user="appearNote.user" indicator link preview/>
				<div :class="$style.noteHeaderBody">
					<div>
						<MkA v-user-preview="appearNote.user.id" :class="$style.noteHeaderName" :to="userPage(appearNote.user)">
							<MkUserName :nowrap="false" :user="appearNote.user"/>
						</MkA>
						<span v-if="appearNote.user.isBot" :class="$style.isBot">bot</span>
						<div :class="$style.noteHeaderInfo">
							<span v-if="appearNote.visibility !== 'public'" style="margin-left: 0.5em;" :title="i18n.ts._visibility[appearNote.visibility]">
								<i v-if="appearNote.visibility === 'home'" class="ph-house ph-bold ph-lg"></i>
								<i v-else-if="appearNote.visibility === 'followers'" class="ph-lock ph-bold ph-lg"></i>
								<i v-else-if="appearNote.visibility === 'specified'" ref="specified" class="ph-envelope ph-bold ph-lg"></i>
							</span>
							<span v-if="appearNote.localOnly" style="margin-left: 0.5em;" :title="i18n.ts._visibility['disableFederation']"><i class="ph-rocket ph-bold ph-lg"></i></span>
						</div>
					</div>
					<div :class="$style.noteHeaderUsername"><MkAcct :user="appearNote.user"/></div>
					<MkInstanceTicker v-if="showTicker" :instance="appearNote.user.instance" :host="appearNote.user.host"/>
				</div>
			</header>
			<div :class="$style.noteContent">
				<p v-if="appearNote.cw != null" :class="$style.cw">
					<Mfm v-if="appearNote.cw != ''" style="margin-right: 8px;" :text="appearNote.cw" :isBlock="true" :author="appearNote.user" :nyaize="'respect'"/>
					<MkCwButton v-model="showContent" :text="appearNote.text" :files="appearNote.files" :poll="appearNote.poll"/>
				</p>
				<div v-show="appearNote.cw == null || showContent">
					<span v-if="appearNote.isHidden" style="opacity: 0.5">({{ i18n.ts.private }})</span>
					<MkA v-if="appearNote.replyId" :class="$style.noteReplyTarget" :to="`/notes/${appearNote.replyId}`"><i class="ph-arrow-bend-left-up ph-bold ph-lg"></i></MkA>
					<Mfm v-if="appearNote.text" :text="appearNote.text" :isBlock="true" :author="appearNote.user" :nyaize="'respect'" :emojiUrls="appearNote.emojis"/>
					<a v-if="appearNote.renote != null" :class="$style.rn">RN:</a>
					<div v-if="translating || translation" :class="$style.translation">
						<MkLoading v-if="translating" mini/>
						<!-- <div v-else>
							<b>{{ i18n.t('translatedFrom', { x: translation.sourceLang }) }}: </b>
							<Mfm :text="translation.text" :isBlock="true" :author="appearNote.user" :nyaize="'respect'" :emojiUrls="appearNote.emojis"/>
						</div> -->
					</div>
					<div v-if="appearNote.files && appearNote.files.length > 0">
						<MkMediaList :mediaList="appearNote.files"/>
					</div>
					<MkPoll v-if="appearNote.poll" :noteId="appearNote.id" :poll="appearNote.poll" :local="!appearNote.user.host" :author="appearNote.user" :emojiUrls="appearNote.emojis" :class="$style.poll"/>
					<MkUrlPreview v-for="url in urls" :key="url" :url="url" :compact="true" :detail="true" style="margin-top: 6px;"/>
					<div v-if="appearNote.renote" :class="$style.quote"><MkNoteSimple :note="appearNote.renote" :class="$style.quoteNote"/></div>
				</div>
				<MkA v-if="appearNote.channel && !inChannel" :class="$style.channel" :to="`/channels/${appearNote.channel.id}`"><i class="ph-television ph-bold ph-lg"></i> {{ appearNote.channel.name }}</MkA>
			</div>
			<footer :class="$style.footer">
				<div :class="$style.noteFooterInfo">
					<MkTime :time="appearNote.createdAt" mode="detail"/>
				</div>
				<button class="_button" :class="$style.noteFooterButton">
					<i class="ph-arrow-u-up-left ph-bold ph-lg"></i>
				</button>
				<button class="_button" :class="$style.noteFooterButton">
					<i class="ph-rocket-launch ph-bold ph-lg"></i>
				</button>
				<button class="_button" :class="$style.noteFooterButton">
					<i class="ph-quotes ph-bold ph-lg"></i>
				</button>
				<button class="_button" :class="$style.noteFooterButton">
					<i class="ph-heart ph-bold ph-lg"></i>
				</button>
			</footer>
		</article>
	</div>
</MkWindow>
</template>

<script lang="ts" setup>
import { inject, onMounted, ref, shallowRef, computed } from 'vue';
import * as mfm from '@transfem-org/sfm-js';
import * as Misskey from 'misskey-js';
import MkNoteSimple from '@/components/MkNoteSimple.vue';
import MkMediaList from '@/components/MkMediaList.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import MkWindow from '@/components/MkWindow.vue';
import MkPoll from '@/components/MkPoll.vue';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import MkInstanceTicker from '@/components/MkInstanceTicker.vue';
import { userPage } from '@/filters/user.js';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';
import { i18n } from '@/i18n.js';
import { deepClone } from '@/utility/clone.js';
import { dateTimeFormat } from '@/utility/intl-const.js';
import { prefer } from '@/preferences';
import { getPluginHandlers } from '@/plugin.js';
import { spacingNote } from '@/utility/autospacing';

const props = defineProps<{
	note: Misskey.entities.Note;
	oldText: string;
	updatedAt: string;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const inChannel = inject('inChannel', null);

let note = ref(deepClone(props.note));

// plugin
const noteViewInterruptors = getPluginHandlers('note_view_interruptor');
if (noteViewInterruptors.length > 0) {
	onMounted(async () => {
		let result: Misskey.entities.Note | null = deepClone(note.value);
		for (const interruptor of noteViewInterruptors) {
			try {
				result = await interruptor.handler(result!) as Misskey.entities.Note | null;
				if (result === null) {
					return;
				}
			} catch (err) {
				console.error(err);
			}
		}
		note.value = result as Misskey.entities.Note;
	});
}

const replaceContent = () => {
	props.oldText ? note.value.text = props.oldText : undefined;
	note.value.createdAt = props.updatedAt;
};
replaceContent();

const isRenote = (
	note.value.renote != null &&
	note.value.text == null &&
	!note.value.fileIds?.length &&
	note.value.poll == null
);

const el = shallowRef<HTMLElement>();
let appearNote = computed(() => spacingNote(isRenote ? note.value.renote as Misskey.entities.Note : note.value));
const renoteUrl = appearNote.value.renote ? appearNote.value.renote.url : null;
const renoteUri = appearNote.value.renote ? appearNote.value.renote.uri : null;

const showContent = ref(false);
const translation = ref(null);
const translating = ref(false);
const urls = appearNote.value.text ? extractUrlFromMfm(mfm.parse(appearNote.value.text)).filter(u => u !== renoteUrl && u !== renoteUri) : null;
const showTicker = (prefer.s.instanceTicker === 'always') || (prefer.s.instanceTicker === 'remote' && appearNote.value.user.instance);

</script>

<style lang="scss" module>
.root {
	position: relative;
	transition: box-shadow 0.1s ease;
	overflow: clip;
	contain: content;
}

.footer {
		position: relative;
		z-index: 1;
		margin-top: 0.4em;
		width: max-content;
		min-width: max-content;
}

.note {
	padding: 32px;
	font-size: 1.2em;
	overflow: hidden;
}

.noteHeader {
	display: flex;
	position: relative;
	margin-bottom: 16px;
	align-items: center;
	z-index: 2;
}

.noteHeaderAvatar {
	display: block;
	flex-shrink: 0;
	width: var(--MI-avatar);
	height: var(--MI-avatar);
}

.noteHeaderBody {
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
	padding-left: 16px;
	font-size: 0.95em;
}

.noteHeaderName {
	font-weight: bold;
	line-height: 1.3;
}

.isBot {
	display: inline-block;
	margin: 0 0.5em;
	padding: 4px 6px;
	font-size: 80%;
	line-height: 1;
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: var(--MI-radius-xs);
}

.noteHeaderInfo {
	float: right;
}

.noteFooterInfo {
	margin: 16px 0;
	opacity: 0.7;
	font-size: 0.9em;
}

.noteHeaderUsername {
	margin-bottom: 2px;
	line-height: 1.3;
	word-wrap: anywhere;
}

.noteContent {
	container-type: inline-size;
	overflow-wrap: break-word;
}

.cw {
	cursor: default;
	display: block;
	margin: 0;
	padding: 0;
	overflow-wrap: break-word;
}

.noteReplyTarget {
	color: var(--MI_THEME-accent);
	margin-right: 0.5em;
}

.rn {
	margin-left: 4px;
	font-style: oblique;
	color: var(--MI_THEME-renote);
}

.translation {
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	padding: 12px;
	margin-top: 8px;
}

.poll {
	font-size: 80%;
}

.quote {
	padding: 8px 0;
}

.quoteNote {
	padding: 16px;
	border: dashed 1px var(--MI_THEME-renote);
	border-radius: var(--MI-radius-xs);
	overflow: clip;
}

.channel {
	opacity: 0.7;
	font-size: 80%;
}

.noteFooterButton {
	margin: 0;
	padding: 8px;
	opacity: 0.7;

	&:not(:last-child) {
		margin-right: 1.5em;
	}

	&:hover {
		color: var(--MI_THEME-fgHighlighted);
	}
}

@container (max-width: 350px) {
	.noteFooterButton {
		&:not(:last-child) {
			margin-right: 0.1em;
		}
	}
}

@container (max-width: 500px) {
	.root {
		font-size: 0.9em;
	}
}

@container (max-width: 450px) {
	.note {
		padding: 16px;
	}

	.noteHeaderAvatar {
		width: 50px;
		height: 50px;
	}
}

@container (max-width: 300px) {
	.root {
		font-size: 0.825em;
	}

	.noteHeaderAvatar {
		width: 50px;
		height: 50px;
	}

	.noteFooterButton {
		&:not(:last-child) {
			margin-right: 0.1em;
		}
	}
}
</style>
