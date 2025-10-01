<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SkMutedNote v-show="!isDeleted" ref="rootComp" :note="appearNote" :mutedClass="$style.muted" :expandedClass="[$style.root, { [$style.children]: depth > 1 }]" @expandMute="n => emit('expandMute', n)">
	<div :class="$style.main">
		<div v-if="note.channel" :class="$style.colorBar" :style="{ background: note.channel.color }"></div>
		<MkAvatar :class="$style.avatar" :user="note.user" link preview/>
		<div :class="$style.body">
			<MkNoteHeader :class="$style.header" :note="note" :mini="true"/>
			<div :class="$style.content">
				<p v-if="appearNote.cw != null" :class="$style.cw">
					<Mfm v-if="appearNote.cw != ''" style="margin-right: 8px;" :text="appearNote.cw" :isBlock="true" :author="note.user" :nyaize="'respect'"/>
					<MkCwButton v-model="showContent" :text="note.text" :files="note.files" :poll="note.poll"/>
				</p>
				<div v-show="appearNote.cw == null || showContent">
					<MkSubNoteContent :class="$style.text" :note="note" :translating="translating" :translation="translation" :expandAllCws="props.expandAllCws"/>
				</div>
			</div>
			<footer :class="$style.footer" class="_gaps _h_gaps" tabindex="0" role="group" :aria-label="i18n.ts.noteFooterLabel">
				<MkReactionsViewer ref="reactionsViewer" :note="note"/>
				<button class="_button" :class="$style.noteFooterButton" @click="reply()">
					<i class="ph-arrow-u-up-left ph-bold ph-lg"></i>
					<p v-if="note.repliesCount > 0" :class="$style.noteFooterButtonCount">{{ note.repliesCount }}</p>
				</button>
				<button
					v-if="canRenote"
					ref="renoteButton"
					v-tooltip="renoteTooltip"
					class="_button"
					:class="$style.noteFooterButton"
					:style="appearNote.isRenoted ? 'color: var(--MI_THEME-accent) !important;' : ''"
					@click.stop="appearNote.isRenoted ? undoRenote() : boostVisibility($event.shiftKey)"
				>
					<i class="ph-rocket-launch ph-bold ph-lg"></i>
					<p v-if="note.renoteCount > 0" :class="$style.noteFooterButtonCount">{{ note.renoteCount }}</p>
				</button>
				<button
					v-if="canRenote && !$i?.rejectQuotes"
					ref="quoteButton"
					class="_button"
					:class="$style.noteFooterButton"
					@click.stop="quote()"
				>
					<i class="ph-quotes ph-bold ph-lg"></i>
				</button>
				<button v-else class="_button" :class="$style.noteFooterButton" disabled>
					<i class="ph-prohibit ph-bold ph-lg"></i>
				</button>
				<button v-if="note.myReaction == null && note.reactionAcceptance !== 'likeOnly'" ref="likeButton" :class="$style.noteFooterButton" class="_button" @click.stop="like()">
					<i class="ph-heart ph-bold ph-lg"></i>
				</button>
				<button v-if="note.myReaction == null" ref="reactButton" :class="$style.noteFooterButton" class="_button" @click.stop="react()">
					<i v-if="note.reactionAcceptance === 'likeOnly'" class="ph-heart ph-bold ph-lg"></i>
					<i v-else class="ph-smiley ph-bold ph-lg"></i>
				</button>
				<button v-if="note.myReaction != null" ref="reactButton" class="_button" :class="[$style.noteFooterButton, $style.reacted]" @click="undoReact(note)">
					<i class="ph-minus ph-bold ph-lg"></i>
				</button>
				<button v-if="prefer.s.showClipButtonInNoteFooter" ref="clipButton" :class="$style.noteFooterButton" class="_button" @click.stop="clip()">
					<i class="ti ti-paperclip"></i>
				</button>
				<button v-if="prefer.s.showTranslationButtonInNoteFooter && policies.canUseTranslator && instance.translatorAvailable" ref="translationButton" class="_button" :class="$style.noteFooterButton" :disabled="translating || !!translation" @click.stop="translate()">
					<i class="ti ti-language-hiragana"></i>
				</button>
				<button ref="menuButton" class="_button" :class="$style.noteFooterButton" @click.stop="menu()">
					<i class="ph-dots-three ph-bold ph-lg"></i>
				</button>
			</footer>
		</div>
	</div>
	<template v-if="depth < prefer.s.numberOfReplies">
		<MkNoteSub v-for="reply in replies" :key="reply.id" :note="reply" :class="$style.reply" :detail="true" :depth="depth + 1" :expandAllCws="props.expandAllCws" :onDeleteCallback="removeReply" @expandMute="n => emit('expandMute', n)"/>
	</template>
	<div v-else :class="$style.more">
		<MkA class="_link" :to="notePage(note)">{{ i18n.ts.continueThread }} <i class="ti ti-chevron-double-right"></i></MkA>
	</div>
</SkMutedNote>
</template>

<script lang="ts" setup>
import { computed, inject, ref, shallowRef, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import * as config from '@@/js/config.js';
import type { Ref } from 'vue';
import type { Visibility } from '@/utility/boost-quote.js';
import type { OpenOnRemoteOptions } from '@/utility/please-login.js';
import MkNoteHeader from '@/components/MkNoteHeader.vue';
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import MkSubNoteContent from '@/components/MkSubNoteContent.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import { notePage } from '@/filters/note.js';
import * as os from '@/os.js';
import * as sound from '@/utility/sound.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { userPage } from '@/filters/user.js';
import { pleaseLogin } from '@/utility/please-login.js';
import { showMovedDialog } from '@/utility/show-moved-dialog.js';
import MkRippleEffect from '@/components/MkRippleEffect.vue';
import { reactionPicker } from '@/utility/reaction-picker.js';
import { claimAchievement } from '@/utility/achievements.js';
import { getNoteClipMenu, getNoteMenu, translateNote } from '@/utility/get-note-menu.js';
import { boostMenuItems, computeRenoteTooltip } from '@/utility/boost-quote.js';
import { prefer } from '@/preferences.js';
import { useNoteCapture } from '@/use/use-note-capture.js';
import SkMutedNote from '@/components/SkMutedNote.vue';
import { instance, policies } from '@/instance';
import { getAppearNote } from '@/utility/get-appear-note';
import { setupNoteViewInterruptors } from '@/plugin.js';
import { deepClone } from '@/utility/clone.js';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	detail?: boolean;
	expandAllCws?: boolean;
	onDeleteCallback?: (id: Misskey.entities.Note['id']) => void;

	// how many notes are in between this one and the note being viewed in detail
	depth?: number;
}>(), {
	depth: 1,
	onDeleteCallback: undefined,
});

const emit = defineEmits<{
	(ev: 'expandMute', note: Misskey.entities.Note): void;
}>();

const note = ref(deepClone(props.note));

const appearNote = computed(() => getAppearNote(note.value));

const canRenote = computed(() => ['public', 'home'].includes(appearNote.value.visibility) || appearNote.value.userId === $i?.id);

const rootComp = useTemplateRef('rootComp');
const el = computed(() => rootComp.value?.rootEl ?? null);
const translation = ref<Misskey.entities.NotesTranslateResponse | false | null>(null);
const translating = ref(false);
const isDeleted = ref(false);
const reactButton = shallowRef<HTMLElement>();
const clipButton = useTemplateRef('clipButton');
const renoteButton = shallowRef<HTMLElement>();
const quoteButton = shallowRef<HTMLElement>();
const menuButton = shallowRef<HTMLElement>();
const likeButton = shallowRef<HTMLElement>();

const renoteTooltip = computeRenoteTooltip(appearNote);

const defaultLike = computed(() => prefer.s.like ? prefer.s.like : null);
const replies = ref<Misskey.entities.Note[]>([]);

const pleaseLoginContext = computed<OpenOnRemoteOptions>(() => ({
	type: 'lookup',
	url: appearNote.value.url ?? appearNote.value.uri ?? `${config.url}/notes/${appearNote.value.id}`,
}));

const currentClip = inject<Ref<Misskey.entities.Clip> | null>('currentClip', null);

setupNoteViewInterruptors(note, isDeleted);

async function addReplyTo(replyNote: Misskey.entities.Note) {
	replies.value.unshift(replyNote);
	appearNote.value.repliesCount += 1;
}

async function removeReply(id: Misskey.entities.Note['id']) {
	const replyIdx = replies.value.findIndex(reply => reply.id === id);
	if (replyIdx >= 0) {
		replies.value.splice(replyIdx, 1);
		appearNote.value.repliesCount -= 1;
	}
}

useNoteCapture({
	rootEl: el,
	note: appearNote,
	isDeletedRef: isDeleted,
	// only update replies if we are, in fact, showing replies
	onReplyCallback: props.detail && props.depth < prefer.s.numberOfReplies ? addReplyTo : undefined,
	onDeleteCallback: props.detail && props.depth < prefer.s.numberOfReplies ? props.onDeleteCallback : undefined,
});

function focus() {
	el.value?.focus();
}

async function reply(viaKeyboard = false): Promise<void> {
	pleaseLogin({ openOnRemote: pleaseLoginContext.value });
	showMovedDialog();
	await os.post({
		reply: appearNote.value,
		channel: appearNote.value.channel ?? undefined,
		animation: !viaKeyboard,
	});
	focus();
}

function react(): void {
	pleaseLogin({ openOnRemote: pleaseLoginContext.value });
	showMovedDialog();
	sound.playMisskeySfx('reaction');
	if (appearNote.value.reactionAcceptance === 'likeOnly') {
		misskeyApi('notes/like', {
			noteId: appearNote.value.id,
			override: defaultLike.value,
		});
		const el = reactButton.value as HTMLElement | null | undefined;
		if (el) {
			const rect = el.getBoundingClientRect();
			const x = rect.left + (el.offsetWidth / 2);
			const y = rect.top + (el.offsetHeight / 2);
			const { dispose } = os.popup(MkRippleEffect, { x, y }, {
				end: () => dispose(),
			});
		}
	} else {
		blur();
		reactionPicker.show(reactButton.value ?? null, appearNote.value, reaction => {
			misskeyApi('notes/reactions/create', {
				noteId: appearNote.value.id,
				reaction: reaction,
			});
			if (appearNote.value.text && appearNote.value.text.length > 100 && (Date.now() - new Date(appearNote.value.createdAt).getTime() < 1000 * 3)) {
				claimAchievement('reactWithoutRead');
			}
		}, () => {
			focus();
		});
	}
}

function like(): void {
	pleaseLogin({ openOnRemote: pleaseLoginContext.value });
	showMovedDialog();
	sound.playMisskeySfx('reaction');
	misskeyApi('notes/like', {
		noteId: appearNote.value.id,
		override: defaultLike.value,
	});
	const el = likeButton.value as HTMLElement | null | undefined;
	if (el) {
		const rect = el.getBoundingClientRect();
		const x = rect.left + (el.offsetWidth / 2);
		const y = rect.top + (el.offsetHeight / 2);
		const { dispose } = os.popup(MkRippleEffect, { x, y }, {
			end: () => dispose(),
		});
	}
}

function undoReact(targetNote: Misskey.entities.Note): void {
	const oldReaction = targetNote.myReaction;
	if (!oldReaction) return;
	misskeyApi('notes/reactions/delete', {
		noteId: targetNote.id,
	});
}

function undoRenote() : void {
	if (!appearNote.value.isRenoted) return;
	misskeyApi('notes/unrenote', {
		noteId: appearNote.value.id,
	});
	os.toast(i18n.ts.rmboost);
	appearNote.value.isRenoted = false;

	const el = renoteButton.value as HTMLElement | null | undefined;
	if (el) {
		const rect = el.getBoundingClientRect();
		const x = rect.left + (el.offsetWidth / 2);
		const y = rect.top + (el.offsetHeight / 2);
		const { dispose } = os.popup(MkRippleEffect, { x, y }, {
			end: () => dispose(),
		});
	}
}

let showContent = ref(prefer.s.uncollapseCW);

watch(() => props.expandAllCws, (expandAllCws) => {
	if (expandAllCws !== showContent.value) showContent.value = expandAllCws;
});

function boostVisibility(forceMenu: boolean = false) {
	if (!prefer.s.showVisibilitySelectorOnBoost && !forceMenu) {
		renote(prefer.s.visibilityOnBoost);
	} else {
		os.popupMenu(boostMenuItems(appearNote, renote), renoteButton.value);
	}
}

function renote(visibility: Visibility, localOnly: boolean = false) {
	pleaseLogin({ openOnRemote: pleaseLoginContext.value });
	showMovedDialog();

	if (appearNote.value.channel) {
		const el = renoteButton.value as HTMLElement | null | undefined;
		if (el) {
			const rect = el.getBoundingClientRect();
			const x = rect.left + (el.offsetWidth / 2);
			const y = rect.top + (el.offsetHeight / 2);
			const { dispose } = os.popup(MkRippleEffect, { x, y }, {
				end: () => dispose(),
			});
		}

		misskeyApi('notes/create', {
			renoteId: appearNote.value.id,
			channelId: appearNote.value.channelId,
		}).then(() => {
			os.toast(i18n.ts.renoted);
			appearNote.value.isRenoted = true;
		});
	} else {
		const el = renoteButton.value as HTMLElement | null | undefined;
		if (el) {
			const rect = el.getBoundingClientRect();
			const x = rect.left + (el.offsetWidth / 2);
			const y = rect.top + (el.offsetHeight / 2);
			const { dispose } = os.popup(MkRippleEffect, { x, y }, {
				end: () => dispose(),
			});
		}

		misskeyApi('notes/create', {
			renoteId: appearNote.value.id,
			localOnly: localOnly,
			visibility: visibility,
		}).then(() => {
			os.toast(i18n.ts.renoted);
			appearNote.value.isRenoted = true;
		});
	}
}

function quote() {
	pleaseLogin({ openOnRemote: pleaseLoginContext.value });
	showMovedDialog();

	os.post({
		renote: appearNote.value,
		channel: appearNote.value.channel ?? undefined,
	}).then((cancelled) => {
		if (cancelled) return;
		misskeyApi('notes/renotes', {
			noteId: appearNote.value.id,
			userId: $i?.id,
			limit: 1,
			quote: true,
		}).then((res) => {
			if (!(res.length > 0)) return;
			const popupEl = quoteButton.value as HTMLElement | null | undefined;
			if (popupEl && res.length > 0) {
				const rect = popupEl.getBoundingClientRect();
				const x = rect.left + (popupEl.offsetWidth / 2);
				const y = rect.top + (popupEl.offsetHeight / 2);
				const { dispose } = os.popup(MkRippleEffect, { x, y }, {
					end: () => dispose(),
				});
			}

			os.toast(i18n.ts.quoted);
		});
	});
}

function menu(): void {
	const { menu, cleanup } = getNoteMenu({ note: appearNote.value, translating, translation, isDeleted });
	os.popupMenu(menu, menuButton.value).then(focus).finally(cleanup);
}

async function clip(): Promise<void> {
	os.popupMenu(await getNoteClipMenu({ note: appearNote.value, isDeleted, currentClip: currentClip?.value }), clipButton.value).then(focus);
}

async function translate() {
	await translateNote(appearNote.value.id, translation, translating);
}

if (props.detail) {
	misskeyApi('notes/children', {
		noteId: appearNote.value.id,
		limit: prefer.s.numberOfReplies,
		showQuotes: false,
	}).then(res => {
		replies.value = res;
	});
}
</script>

<style lang="scss" module>
.root {
	padding: 16px 32px;
	font-size: 0.9em;
	position: relative;

	&.children {
		padding: 10px 0 0 16px;
		font-size: 1em;
	}
}

.footer {
	position: relative;
	z-index: 1;
	margin-top: 0.4em;
	overflow-x: auto;
}

.main {
	display: flex;
}

.colorBar {
	position: absolute;
	top: 8px;
	left: 8px;
	width: 5px;
	height: calc(100% - 8px);
	border-radius: var(--MI-radius-ellipse);
	pointer-events: none;
}

.avatar {
	flex-shrink: 0;
	display: block;
	margin: 0 8px 0 0;
	width: 38px;
	height: 38px;
	border-radius: var(--MI-radius-sm);
}

.body {
	flex: 1;
	min-width: 0;
}

.content {
	overflow: hidden;
}

.header {
	margin-bottom: 2px;
}

.noteFooterButton {
	margin: 0;
	padding: 8px;
	padding-top: 10px;
	opacity: 0.7;

	&:hover {
		color: var(--MI_THEME-fgHighlighted);
	}
}

.noteFooterButtonCount {
	display: inline;
	margin: 0 0 0 8px;
	opacity: 0.7;

	&.reacted {
		color: var(--MI_THEME-accent);
	}
}

.cw {
	display: block;
	margin: 0;
	padding: 0;
	overflow-wrap: break-word;
}

.text {
	margin: 0;
	padding: 0;
}

.reply, .more {
	border-left: solid 0.5px var(--MI_THEME-divider);
	margin-top: 10px;
}

.more {
	padding: 10px 0 0 16px;
}

@container (max-width: 450px) {
	.root {
		padding: 14px 16px;

		&.children {
			padding: 10px 0 0 8px;
		}
	}
}

.muted {
	border: 1px solid var(--MI_THEME-divider);
	margin: 8px 8px 0 8px;
	border-radius: var(--MI-radius-sm);
}
</style>
