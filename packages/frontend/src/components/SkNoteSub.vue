<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-show="!isDeleted" v-if="!muted" ref="el" :class="[$style.root, { [$style.children]: depth > 1, [$style.isReply]: props.isReply, [$style.detailed]: props.detailed }]">
	<div v-if="!hideLine" :class="$style.line"></div>
	<div :class="$style.main">
		<div v-if="note.channel" :class="$style.colorBar" :style="{ background: note.channel.color }"></div>
		<!-- new avatar container with line (post section) -->
		<div :class="$style.avatarContainer">
			<MkAvatar :class="$style.avatar" :user="note.user" link preview/>
			<template v-if="note.repliesCount > 0 && replies.length > 0">
				<div v-if="hideLine" :class="$style.threadLine"></div>
			</template>
		</div>
		<!-- end new avatar container -->
		<div :class="$style.body">
			<SkNoteHeader :class="$style.header" :note="note" :classic="true" :mini="true"/>
			<div :class="$style.content">
				<p v-if="note.cw != null" :class="$style.cw">
					<Mfm v-if="note.cw != ''" style="margin-right: 8px;" :text="note.cw" :isBlock="true" :author="note.user" :nyaize="'respect'"/>
					<MkCwButton v-model="showContent" :text="note.text" :files="note.files" :poll="note.poll"/>
				</p>
				<div v-show="note.cw == null || showContent">
					<MkSubNoteContent :class="$style.text" :note="note" :translating="translating" :translation="translation" :expandAllCws="props.expandAllCws"/>
				</div>
			</div>
			<MkReactionsViewer ref="reactionsViewer" :note="note"/>
			<footer :class="$style.footer">
				<button class="_button" :class="$style.noteFooterButton" @click="reply()">
					<i class="ph-arrow-u-up-left ph-bold ph-lg"></i>
					<p v-if="note.repliesCount > 0" :class="$style.noteFooterButtonCount">{{ note.repliesCount }}</p>
				</button>
				<button
					v-if="canRenote"
					ref="renoteButton"
					class="_button"
					:class="$style.noteFooterButton"
					:style="renoted ? 'color: var(--accent) !important;' : ''"
					@mousedown="renoted ? undoRenote() : boostVisibility()"
				>
					<i class="ph-rocket-launch ph-bold ph-lg"></i>
					<p v-if="note.renoteCount > 0" :class="$style.noteFooterButtonCount">{{ note.renoteCount }}</p>
				</button>
				<button
					v-if="canRenote"
					ref="quoteButton"
					class="_button"
					:class="$style.noteFooterButton"
					@mousedown="quote()"
				>
					<i class="ph-quotes ph-bold ph-lg"></i>
				</button>
				<button v-else class="_button" :class="$style.noteFooterButton" disabled>
					<i class="ph-prohibit ph-bold ph-lg"></i>
				</button>
				<button v-if="note.myReaction == null && note.reactionAcceptance !== 'likeOnly'" ref="likeButton" :class="$style.noteFooterButton" class="_button" @mousedown="like()">
					<i class="ph-heart ph-bold ph-lg"></i>
				</button>
				<button v-if="note.myReaction == null" ref="reactButton" :class="$style.noteFooterButton" class="_button" @mousedown="react()">
					<i v-if="note.reactionAcceptance === 'likeOnly'" class="ph-heart ph-bold ph-lg"></i>
					<i v-else class="ph-smiley ph-bold ph-lg"></i>
				</button>
				<button v-if="note.myReaction != null" ref="reactButton" class="_button" :class="[$style.noteFooterButton, $style.reacted]" @click="undoReact(note)">
					<i class="ph-minus ph-bold ph-lg"></i>
				</button>
				<button ref="menuButton" class="_button" :class="$style.noteFooterButton" @mousedown="menu()">
					<i class="ph-dots-three ph-bold ph-lg"></i>
				</button>
			</footer>
		</div>
	</div>
	<template v-if="depth < numberOfReplies">
		<SkNoteSub v-for="reply in replies" :key="reply.id" :note="reply" :class="[$style.reply, { [$style.single]: replies.length === 1 }]" :detail="true" :depth="depth + 1" :expandAllCws="props.expandAllCws" :onDeleteCallback="removeReply" :isReply="props.isReply"/>
	</template>
	<div v-else :class="$style.more">
		<MkA class="_link" :to="notePage(note)">{{ i18n.ts.continueThread }} <i class="ph-caret-double-right ph-bold ph-lg"></i></MkA>
	</div>
</div>
<div v-else :class="$style.muted" @click="muted = false">
	<I18n :src="i18n.ts.userSaysSomething" tag="small">
		<template #name>
			<MkA v-user-preview="note.userId" :to="userPage(note.user)">
				<MkUserName :user="note.user"/>
			</MkA>
		</template>
	</I18n>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, shallowRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import SkNoteHeader from '@/components/SkNoteHeader.vue';
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import MkSubNoteContent from '@/components/MkSubNoteContent.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import { notePage } from '@/filters/note.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import * as sound from '@/scripts/sound.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/account.js';
import { userPage } from '@/filters/user.js';
import { checkWordMute } from '@/scripts/check-word-mute.js';
import { defaultStore } from '@/store.js';
import { pleaseLogin } from '@/scripts/please-login.js';
import { showMovedDialog } from '@/scripts/show-moved-dialog.js';
import MkRippleEffect from '@/components/MkRippleEffect.vue';
import { reactionPicker } from '@/scripts/reaction-picker.js';
import { claimAchievement } from '@/scripts/achievements.js';
import { getNoteMenu } from '@/scripts/get-note-menu.js';
import { useNoteCapture } from '@/scripts/use-note-capture.js';
import { boostMenuItems, type Visibility } from '@/scripts/boost-quote.js';

const canRenote = computed(() => ['public', 'home'].includes(props.note.visibility) || props.note.userId === $i.id);
const hideLine = computed(() => { return props.detail ? true : false; });

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	detail?: boolean;
	expandAllCws?: boolean;
	onDeleteCallback?: (id: Misskey.entities.Note['id']) => void;

	// how many notes are in between this one and the note being viewed in detail
	depth?: number;

	isReply?: boolean;
	detailed?: boolean;
}>(), {
	depth: 1,
	isReply: false,
	detailed: false,
});

const el = shallowRef<HTMLElement>();
const muted = ref($i ? checkWordMute(props.note, $i, $i.mutedWords) : false);
const translation = ref<any>(null);
const translating = ref(false);
const isDeleted = ref(false);
const renoted = ref(false);
const numberOfReplies = ref(defaultStore.state.numberOfReplies);
const reactButton = shallowRef<HTMLElement>();
const renoteButton = shallowRef<HTMLElement>();
const quoteButton = shallowRef<HTMLElement>();
const menuButton = shallowRef<HTMLElement>();
const likeButton = shallowRef<HTMLElement>();

let appearNote = computed(() => isRenote ? props.note.renote as Misskey.entities.Note : props.note);
const defaultLike = computed(() => defaultStore.state.like ? defaultStore.state.like : null);
const replies = ref<Misskey.entities.Note[]>([]);

const isRenote = (
	props.note.renote != null &&
	props.note.text == null &&
	props.note.fileIds && props.note.fileIds.length === 0 &&
	props.note.poll == null
);

async function addReplyTo(replyNote: Misskey.entities.Note) {
	replies.value.unshift(replyNote);
	appearNote.value.repliesCount += 1;
}

async function removeReply(id: Misskey.entities.Note['id']) {
	const replyIdx = replies.value.findIndex(note => note.id === id);
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
	onReplyCallback: props.detail && props.depth < numberOfReplies.value ? addReplyTo : undefined,
	onDeleteCallback: props.detail && props.depth < numberOfReplies.value ? props.onDeleteCallback : undefined,
});

if ($i) {
	misskeyApi('notes/renotes', {
		noteId: appearNote.value.id,
		userId: $i.id,
		limit: 1,
	}).then((res) => {
		renoted.value = res.length > 0;
	});
}

function focus() {
	el.value.focus();
}

function reply(viaKeyboard = false): void {
	pleaseLogin();
	showMovedDialog();
	os.post({
		reply: props.note,
		channel: props.note.channel,
		animation: !viaKeyboard,
	}, () => {
		focus();
	});
}

function react(viaKeyboard = false): void {
	pleaseLogin();
	showMovedDialog();
	sound.playMisskeySfx('reaction');
	if (props.note.reactionAcceptance === 'likeOnly') {
		misskeyApi('notes/like', {
			noteId: props.note.id,
			override: defaultLike.value,
		});
		const el = reactButton.value as HTMLElement | null | undefined;
		if (el) {
			const rect = el.getBoundingClientRect();
			const x = rect.left + (el.offsetWidth / 2);
			const y = rect.top + (el.offsetHeight / 2);
			os.popup(MkRippleEffect, { x, y }, {}, 'end');
		}
	} else {
		blur();
		reactionPicker.show(reactButton.value ?? null, props.note, reaction => {
			misskeyApi('notes/reactions/create', {
				noteId: props.note.id,
				reaction: reaction,
			});
			if (props.note.text && props.note.text.length > 100 && (Date.now() - new Date(props.note.createdAt).getTime() < 1000 * 3)) {
				claimAchievement('reactWithoutRead');
			}
		}, () => {
			focus();
		});
	}
}

function like(): void {
	pleaseLogin();
	showMovedDialog();
	sound.playMisskeySfx('reaction');
	misskeyApi('notes/like', {
		noteId: props.note.id,
		override: defaultLike.value,
	});
	const el = likeButton.value as HTMLElement | null | undefined;
	if (el) {
		const rect = el.getBoundingClientRect();
		const x = rect.left + (el.offsetWidth / 2);
		const y = rect.top + (el.offsetHeight / 2);
		os.popup(MkRippleEffect, { x, y }, {}, 'end');
	}
}

function undoReact(note): void {
	const oldReaction = note.myReaction;
	if (!oldReaction) return;
	misskeyApi('notes/reactions/delete', {
		noteId: note.id,
	});
}

function undoRenote() : void {
	if (!renoted.value) return;
	misskeyApi('notes/unrenote', {
		noteId: appearNote.value.id,
	});
	os.toast(i18n.ts.rmboost);
	renoted.value = false;

	const el = renoteButton.value as HTMLElement | null | undefined;
	if (el) {
		const rect = el.getBoundingClientRect();
		const x = rect.left + (el.offsetWidth / 2);
		const y = rect.top + (el.offsetHeight / 2);
		os.popup(MkRippleEffect, { x, y }, {}, 'end');
	}
}

let showContent = ref(defaultStore.state.uncollapseCW);

watch(() => props.expandAllCws, (expandAllCws) => {
	if (expandAllCws !== showContent.value) showContent.value = expandAllCws;
});

function boostVisibility() {
	if (!defaultStore.state.showVisibilitySelectorOnBoost) {
		renote(defaultStore.state.visibilityOnBoost);
	} else {
		os.popupMenu(boostMenuItems(appearNote, renote), renoteButton.value);
	}
}

function renote(visibility: Visibility, localOnly: boolean = false) {
	pleaseLogin();
	showMovedDialog();

	if (appearNote.value.channel) {
		const el = renoteButton.value as HTMLElement | null | undefined;
		if (el) {
			const rect = el.getBoundingClientRect();
			const x = rect.left + (el.offsetWidth / 2);
			const y = rect.top + (el.offsetHeight / 2);
			os.popup(MkRippleEffect, { x, y }, {}, 'end');
		}

		misskeyApi('notes/create', {
			renoteId: appearNote.value.id,
			channelId: appearNote.value.channelId,
		}).then(() => {
			os.toast(i18n.ts.renoted);
			renoted.value = true;
		});
	} else {
		const el = renoteButton.value as HTMLElement | null | undefined;
		if (el) {
			const rect = el.getBoundingClientRect();
			const x = rect.left + (el.offsetWidth / 2);
			const y = rect.top + (el.offsetHeight / 2);
			os.popup(MkRippleEffect, { x, y }, {}, 'end');
		}

		misskeyApi('notes/create', {
			renoteId: appearNote.value.id,
			localOnly: localOnly,
			visibility: visibility,
		}).then(() => {
			os.toast(i18n.ts.renoted);
			renoted.value = true;
		});
	}
}

function quote() {
	pleaseLogin();
	showMovedDialog();

	if (appearNote.value.channel) {
		os.post({
			renote: appearNote.value,
			channel: appearNote.value.channel,
		}).then(() => {
			misskeyApi('notes/renotes', {
				noteId: props.note.id,
				userId: $i.id,
				limit: 1,
				quote: true,
			}).then((res) => {
				if (!(res.length > 0)) return;
				const el = quoteButton.value as HTMLElement | null | undefined;
				if (el && res.length > 0) {
					const rect = el.getBoundingClientRect();
					const x = rect.left + (el.offsetWidth / 2);
					const y = rect.top + (el.offsetHeight / 2);
					os.popup(MkRippleEffect, { x, y }, {}, 'end');
				}

				os.toast(i18n.ts.quoted);
			});
		});
	} else {
		os.post({
			renote: appearNote.value,
		}).then(() => {
			misskeyApi('notes/renotes', {
				noteId: props.note.id,
				userId: $i.id,
				limit: 1,
				quote: true,
			}).then((res) => {
				if (!(res.length > 0)) return;
				const el = quoteButton.value as HTMLElement | null | undefined;
				if (el && res.length > 0) {
					const rect = el.getBoundingClientRect();
					const x = rect.left + (el.offsetWidth / 2);
					const y = rect.top + (el.offsetHeight / 2);
					os.popup(MkRippleEffect, { x, y }, {}, 'end');
				}

				os.toast(i18n.ts.quoted);
			});
		});
	}
}

function menu(viaKeyboard = false): void {
	const { menu, cleanup } = getNoteMenu({ note: props.note, translating, translation, menuButton, isDeleted });
	os.popupMenu(menu, menuButton.value, {
		viaKeyboard,
	}).then(focus).finally(cleanup);
}

if (props.detail) {
	misskeyApi('notes/children', {
		noteId: props.note.id,
		limit: numberOfReplies.value,
		showQuotes: false,
	}).then(res => {
		replies.value = res;
	});
}
</script>

<style lang="scss" module>
.root {
	padding: 28px 32px;
	position: relative;

	--reply-indent: calc(.5 * var(--avatar));

	&.children {
		padding: 10px 0 0 8px;
	}

	&.isReply {
		/* @link https://utopia.fyi/clamp/calculator?a=450,580,26—36 */
		--avatar: clamp(26px, -8.6154px + 7.6923cqi, 36px);
	}
}

.line {
	position: absolute;
	left: calc(32px + .5 * var(--avatar));
	// using solid instead of dotted, stylelistic choice
	border-left: var(--thread-width) solid var(--thread);
	top: calc(28px + var(--avatar)); // 28px of .root padding, plus 58px of avatar height (see SkNote)
	bottom: -28px;
}

.footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	position: relative;
	z-index: 1;
	margin-top: 0.4em;
	max-width: 400px;
}

.main {
	position: relative;
	display:  flex;

	:is(.detailed, .isReply) &::after {
		content: "";
		position: absolute;
		top: -12px;
		right: -12px;
		left: -12px;
		bottom: -12px;
		background: var(--panelHighlight);
		border-radius: var(--radius);
		opacity: 0;
		transition: opacity .2s, background .2s;
		z-index: -1;
	}

	:is(.detailed, .isReply) &:hover::after,
	:is(.detailed, .isReply) &:focus-within::after {
		opacity: 1;
	}
}

.colorBar {
	position: absolute;
	top: 8px;
	left: 8px;
	width: 5px;
	height: calc(100% - 8px);
	border-radius: var(--radius-ellipse);
	pointer-events: none;
}

.avatar {
	flex-shrink: 0;
	display: block;
	margin: 0 14px 0 0;
	width: var(--avatar);
	height: var(--avatar);
	border-radius: var(--radius-sm);
}

.body {
	flex: 1;
	min-width: 0;
}

.content {
	overflow: hidden;
}

.text {
	margin: 0;
	padding: 0;
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
		color: var(--fgHighlighted);
	}
}
// Responsible for Reply borders 448 and 508
.reply, .more {
	//border-left: solid 0.5px var(--divider);
	margin-top: 10px;
}

.more {
	padding: 10px 0 0 16px;
}

@container (max-width: 580px) {
	.root {
		padding: 28px 26px 0;
		--avatar: 46px;
	}

	.line {
		left: calc(26px + .5 * var(--avatar));
	}
}

@container (max-width: 500px) {
	.root {
		padding: 23px 25px;
	}

	.line {
		top: calc(23px + var(--avatar));
		left: calc(25px + .5 * var(--avatar));
	}
}

@container (max-width: 400px) {
	.noteFooterButton {
		&:not(:last-child) {
			margin-right: 0.7em;
		}
	}
}

.noteFooterButtonCount {
	display: inline;
	margin: 0 0 0 8px;
	opacity: 0.7;

	&.reacted {
		color: var(--accent);
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
	//border-left: solid 0.5px var(--divider);
	margin-top: 10px;
}

.more {
	padding: 10px 0 0 16px;
}

@container (max-width: 480px) {
	.root {
		padding: 22px 24px;
	}

	.line {
		top: calc(22px + var(--avatar));
		left: calc(24px + .5 * var(--avatar));
	}
}

@container (max-width: 450px) {
	.root {
		--avatar: 44px;
	}
}

.muted {
	text-align: center;
	padding: 8px !important;
	border: 1px solid var(--divider);
	margin: 8px 8px 0 8px;
	border-radius: var(--radius-sm);
}

// avatar container with line
.avatarContainer {
	display: flex;
	flex-direction: column;
}

.threadLine {
	width: 0;
	flex-grow: 1;
	border-left: var(--thread-width) solid var(--thread);
	margin-left: var(--reply-indent);
}

.reply {
	margin-left: var(--reply-indent);
}

.reply:not(:last-child) {
	border-left: var(--thread-width) solid var(--thread);

	&::before {
		left: calc(-1 * var(--thread-width));
	}
}

.reply::before {
	position: absolute;
	content: '';
	left: 0px;
	top: -10px;
	height: calc(10px + 10px + .5 * var(--avatar));
	width: 15px;
	border-left: var(--thread-width) solid var(--thread);
	border-bottom: var(--thread-width) solid var(--thread);
	border-bottom-left-radius: 15px;
}

.single {
	margin-left: 0;
	padding-left: 0 !important;

	&::before {
		left: var(--reply-indent);
		width: 0;
		border-bottom: unset;
	}
}
</style>
