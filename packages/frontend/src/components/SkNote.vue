<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	v-if="!hardMuted && muted === false"
	v-show="!isDeleted"
	ref="rootEl"
	v-hotkey="keymap"
	:class="[$style.root, { [$style.showActionsOnlyHover]: defaultStore.state.showNoteActionsOnlyHover }]"
	:tabindex="isDeleted ? '-1' : '0'"
>
	<SkNoteSub v-if="appearNote.reply && !renoteCollapsed && !inReplyToCollapsed" :note="appearNote.reply" :class="$style.replyTo"/>
	<div v-if="appearNote.reply && inReplyToCollapsed && !renoteCollapsed" :class="$style.collapsedInReplyTo">
		<div :class="$style.collapsedInReplyToLine"></div>
		<MkAvatar :class="$style.collapsedInReplyToAvatar" :user="appearNote.reply.user" link preview/>
		<MkA v-user-preview="appearNote.reply.userId" :class="$style.name" :to="userPage(appearNote.reply.user)">
			<MkAcct :user="appearNote.reply.user"/>
		</MkA>:
		<Mfm :text="getNoteSummary(appearNote.reply)" :plain="true" :nowrap="true" :author="appearNote.reply.user" :nyaize="'respect'" :class="$style.collapsedInReplyToText" @click="inReplyToCollapsed = false"/>
	</div>
	<div v-if="pinned" :class="$style.tip"><i class="ti ti-pin"></i> {{ i18n.ts.pinnedNote }}</div>
	<!--<div v-if="appearNote._prId_" class="tip"><i class="ti ti-speakerphone"></i> {{ i18n.ts.promotion }}<button class="_textButton hide" @click="readPromo()">{{ i18n.ts.hideThisNote }} <i class="ti ti-x"></i></button></div>-->
	<!--<div v-if="appearNote._featuredId_" class="tip"><i class="ti ti-bolt"></i> {{ i18n.ts.featured }}</div>-->
	<div v-if="isRenote" :class="$style.renote">
		<div v-if="note.channel" :class="$style.colorBar" :style="{ background: note.channel.color }"></div>
		<i class="ti ti-repeat" style="margin-right: 4px;"></i>
		<MkAvatar :class="$style.renoteAvatar" :user="note.user" link preview/>
		<I18n :src="i18n.ts.renotedBy" tag="span" :class="$style.renoteText">
			<template #user>
				<MkA v-user-preview="note.userId" :class="$style.renoteUserName" :to="userPage(note.user)">
					<MkUserName :user="note.user"/>
				</MkA>
			</template>
		</I18n>
		<div :class="$style.renoteInfo">
			<button ref="renoteTime" :class="$style.renoteTime" class="_button" @mousedown.prevent="showRenoteMenu()">
				<i class="ti ti-dots" :class="$style.renoteMenu"></i>
				<MkTime :time="note.createdAt"/>
			</button>
			<span v-if="note.visibility !== 'public'" style="margin-left: 0.5em;" :title="i18n.ts._visibility[note.visibility]">
				<i v-if="note.visibility === 'home'" class="ti ti-home"></i>
				<i v-else-if="note.visibility === 'followers'" class="ti ti-lock"></i>
				<i v-else-if="note.visibility === 'specified'" ref="specified" class="ti ti-mail"></i>
			</span>
			<span v-if="note.localOnly" style="margin-left: 0.5em;" :title="i18n.ts._visibility['disableFederation']"><i class="ti ti-rocket-off"></i></span>
			<span v-if="note.channel" style="margin-left: 0.5em;" :title="note.channel.name"><i class="ti ti-device-tv"></i></span>
			<span v-if="note.updatedAt" ref="menuVersionsButton" style="margin-left: 0.5em;" title="Edited" @mousedown="menuVersions()"><i class="ph-pencil-simple ph-bold ph-lg"></i></span>
		</div>
	</div>
	<div v-if="renoteCollapsed" :class="$style.collapsedRenoteTarget">
		<MkAvatar :class="$style.collapsedRenoteTargetAvatar" :user="appearNote.user" link preview/>
		<Mfm :text="getNoteSummary(appearNote)" :isBlock="true" :plain="true" :nowrap="true" :author="appearNote.user" :nyaize="'respect'" :class="$style.collapsedRenoteTargetText" @click="renoteCollapsed = false; inReplyToCollapsed = false"/>
	</div>
	<article v-else :class="$style.article" @contextmenu.stop="onContextmenu">
		<div style="display: flex; padding-bottom: 10px;">
			<div v-if="appearNote.channel" :class="$style.colorBar" :style="{ background: appearNote.channel.color }"></div>
			<MkAvatar :class="[$style.avatar, { [$style.avatarReplyTo]: appearNote.reply }]" :user="appearNote.user" :link="!mock" :preview="!mock"/>
			<div :class="$style.main">
				<SkNoteHeader :note="appearNote" :mini="true"/>
			</div>
		</div>
		<div :class="[{ [$style.clickToOpen]: defaultStore.state.clickToOpen }]" @click.stop="defaultStore.state.clickToOpen ? noteclick(appearNote.id) : undefined">
			<div style="container-type: inline-size;">
				<p v-if="appearNote.cw != null" :class="$style.cw">
					<Mfm v-if="appearNote.cw != ''" style="margin-right: 8px;" :text="appearNote.cw" :isBlock="true" :author="appearNote.user" :nyaize="'respect'"/>
					<MkCwButton v-model="showContent" :text="appearNote.text" :renote="appearNote.renote" :files="appearNote.files" :poll="appearNote.poll" style="margin: 4px 0;" @click.stop/>
				</p>
				<div v-show="appearNote.cw == null || showContent" :class="[{ [$style.contentCollapsed]: collapsed }]">
					<div :class="$style.text">
						<span v-if="appearNote.isHidden" style="opacity: 0.5">({{ i18n.ts.private }})</span>
						<Mfm
							v-if="appearNote.text"
							:parsedNodes="parsed"
							:text="appearNote.text"
							:author="appearNote.user"
							:nyaize="'respect'"
							:emojiUrls="appearNote.emojis"
							:enableEmojiMenu="true"
							:enableEmojiMenuReaction="true"
							:isAnim="allowAnim"
							:isBlock="true"
						/>
						<div v-if="translating || translation" :class="$style.translation">
							<MkLoading v-if="translating" mini/>
							<div v-else-if="translation">
								<b>{{ i18n.tsx.translatedFrom({ x: translation.sourceLang }) }}: </b>
								<Mfm :text="translation.text" :isBlock="true" :author="appearNote.user" :nyaize="'respect'" :emojiUrls="appearNote.emojis"/>
							</div>
						</div>
						<MkButton v-if="!allowAnim && animated" :class="$style.playMFMButton" :small="true" @click="animatedMFM()" @click.stop><i class="ph-play ph-bold ph-lg "></i> {{ i18n.ts._animatedMFM.play }}</MkButton>
						<MkButton v-else-if="!defaultStore.state.animatedMfm && allowAnim && animated" :class="$style.playMFMButton" :small="true" @click="animatedMFM()" @click.stop><i class="ph-stop ph-bold ph-lg "></i> {{ i18n.ts._animatedMFM.stop }}</MkButton>
					</div>
					<div v-if="appearNote.files && appearNote.files.length > 0">
						<MkMediaList ref="galleryEl" :mediaList="appearNote.files" @click.stop/>
					</div>
					<MkPoll v-if="appearNote.poll" :noteId="appearNote.id" :poll="appearNote.poll" :class="$style.poll" @click.stop/>
					<div v-if="isEnabledUrlPreview">
						<MkUrlPreview v-for="url in urls" :key="url" :url="url" :compact="true" :detail="false" :class="$style.urlPreview" @click.stop/>
					</div>
					<div v-if="appearNote.renote" :class="$style.quote"><SkNoteSimple :note="appearNote.renote" :class="$style.quoteNote"/></div>
					<button v-if="isLong && collapsed" :class="$style.collapsed" class="_button" @click.stop @click="collapsed = false">
						<span :class="$style.collapsedLabel">{{ i18n.ts.showMore }}</span>
					</button>
					<button v-else-if="isLong && !collapsed" :class="$style.showLess" class="_button" @click.stop @click="collapsed = true">
						<span :class="$style.showLessLabel">{{ i18n.ts.showLess }}</span>
					</button>
				</div>
				<MkA v-if="appearNote.channel && !inChannel" :class="$style.channel" :to="`/channels/${appearNote.channel.id}`"><i class="ti ti-device-tv"></i> {{ appearNote.channel.name }}</MkA>
			</div>
			<MkReactionsViewer v-if="appearNote.reactionAcceptance !== 'likeOnly'" :note="appearNote" :maxNumber="16" @click.stop @mockUpdateMyReaction="emitUpdReaction">
				<template #more>
					<MkA :to="`/notes/${appearNote.id}/reactions`" :class="[$style.reactionOmitted]">{{ i18n.ts.more }}</MkA>
				</template>
			</MkReactionsViewer>
			<footer :class="$style.footer">
				<button :class="$style.footerButton" class="_button" @click.stop @click="reply()">
					<i class="ti ti-arrow-back-up"></i>
					<p v-if="appearNote.repliesCount > 0" :class="$style.footerButtonCount">{{ number(appearNote.repliesCount) }}</p>
				</button>
				<button
					v-if="canRenote"
					ref="renoteButton"
					:class="$style.footerButton"
					class="_button"
					:style="renoted ? 'color: var(--accent) !important;' : ''"
					@click.stop
					@mousedown.prevent="renoted ? undoRenote(appearNote) : boostVisibility()"
				>
					<i class="ti ti-repeat"></i>
					<p v-if="appearNote.renoteCount > 0" :class="$style.footerButtonCount">{{ number(appearNote.renoteCount) }}</p>
				</button>
				<button v-else :class="$style.footerButton" class="_button" disabled>
					<i class="ti ti-ban"></i>
				</button>
				<button
					v-if="canRenote && !props.mock"
					ref="quoteButton"
					:class="$style.footerButton"
					class="_button"
					@click.stop
					@mousedown="quote()"
				>
					<i class="ph-quotes ph-bold ph-lg"></i>
				</button>
				<button v-if="appearNote.myReaction == null && appearNote.reactionAcceptance !== 'likeOnly'" ref="likeButton" :class="$style.footerButton" class="_button" @click.stop @click="like()">
					<i class="ph-heart ph-bold ph-lg"></i>
				</button>
				<button ref="reactButton" :class="$style.footerButton" class="_button" @click="toggleReact()" @click.stop>
					<i v-if="appearNote.reactionAcceptance === 'likeOnly' && appearNote.myReaction != null" class="ti ti-heart-filled" style="color: var(--eventReactionHeart);"></i>
					<i v-else-if="appearNote.myReaction != null" class="ti ti-minus" style="color: var(--accent);"></i>
					<i v-else-if="appearNote.reactionAcceptance === 'likeOnly'" class="ti ti-heart"></i>
					<i v-else class="ph-smiley ph-bold ph-lg"></i>
					<p v-if="(appearNote.reactionAcceptance === 'likeOnly' || defaultStore.state.showReactionsCount) && appearNote.reactionCount > 0" :class="$style.footerButtonCount">{{ number(appearNote.reactionCount) }}</p>
				</button>
				<button v-if="defaultStore.state.showClipButtonInNoteFooter" ref="clipButton" :class="$style.footerButton" class="_button" @mousedown.prevent="clip()">
					<i class="ti ti-paperclip"></i>
				</button>
				<button ref="menuButton" :class="$style.footerButton" class="_button" @mousedown.prevent="showMenu()">
					<i class="ti ti-dots"></i>
				</button>
			</footer>
		</div>
	</article>
</div>
<div v-else-if="!hardMuted" :class="$style.muted" @click="muted = false">
	<I18n v-if="muted === 'sensitiveMute'" :src="i18n.ts.userSaysSomethingSensitive" tag="small">
		<template #name>
			<MkA v-user-preview="appearNote.userId" :to="userPage(appearNote.user)">
				<MkUserName :user="appearNote.user"/>
			</MkA>
		</template>
	</I18n>
	<I18n v-else :src="i18n.ts.userSaysSomething" tag="small">
		<template #name>
			<MkA v-user-preview="appearNote.userId" :to="userPage(appearNote.user)">
				<MkUserName :user="appearNote.user"/>
			</MkA>
		</template>
	</I18n>
</div>
<div v-else>
	<!--
		MkDateSeparatedList uses TransitionGroup which requires single element in the child elements
		so MkNote create empty div instead of no elements
	-->
</div>
</template>

<script lang="ts" setup>
import { computed, inject, onMounted, ref, shallowRef, Ref, watch, provide } from 'vue';
import * as mfm from '@transfem-org/sfm-js';
import * as Misskey from 'misskey-js';
import { isPureRenote } from 'misskey-js/note.js';
import SkNoteSub from '@/components/SkNoteSub.vue';
import SkNoteHeader from '@/components/SkNoteHeader.vue';
import SkNoteSimple from '@/components/SkNoteSimple.vue';
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import MkReactionsViewerDetails from '@/components/MkReactionsViewer.details.vue';
import MkMediaList from '@/components/MkMediaList.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import MkPoll from '@/components/MkPoll.vue';
import MkUsersTooltip from '@/components/MkUsersTooltip.vue';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import MkButton from '@/components/MkButton.vue';
import { pleaseLogin, type OpenOnRemoteOptions } from '@/scripts/please-login.js';
import { checkWordMute } from '@/scripts/check-word-mute.js';
import { userPage } from '@/filters/user.js';
import number from '@/filters/number.js';
import * as os from '@/os.js';
import { misskeyApi, misskeyApiGet } from '@/scripts/misskey-api.js';
import * as sound from '@/scripts/sound.js';
import { defaultStore, noteViewInterruptors } from '@/store.js';
import { reactionPicker } from '@/scripts/reaction-picker.js';
import { extractUrlFromMfm } from '@/scripts/extract-url-from-mfm.js';
import { checkAnimationFromMfm } from '@/scripts/check-animated-mfm.js';
import { $i } from '@/account.js';
import { i18n } from '@/i18n.js';
import { getAbuseNoteMenu, getCopyNoteLinkMenu, getNoteClipMenu, getNoteMenu } from '@/scripts/get-note-menu.js';
import { getNoteVersionsMenu } from '@/scripts/get-note-versions-menu.js';
import { useNoteCapture } from '@/scripts/use-note-capture.js';
import { deepClone } from '@/scripts/clone.js';
import { useTooltip } from '@/scripts/use-tooltip.js';
import { claimAchievement } from '@/scripts/achievements.js';
import { getNoteSummary } from '@/scripts/get-note-summary.js';
import { MenuItem } from '@/types/menu.js';
import MkRippleEffect from '@/components/MkRippleEffect.vue';
import { showMovedDialog } from '@/scripts/show-moved-dialog.js';
import { shouldCollapsed } from '@/scripts/collapsed.js';
import { useRouter } from '@/router/supplier.js';
import { boostMenuItems, type Visibility } from '@/scripts/boost-quote.js';
import { host } from '@/config.js';
import { isEnabledUrlPreview } from '@/instance.js';
import { type Keymap } from '@/scripts/hotkey.js';
import { focusPrev, focusNext } from '@/scripts/focus.js';
import { getAppearNote } from '@/scripts/get-appear-note.js';
import { spacingNote } from '@/scripts/autospacing';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	pinned?: boolean;
	mock?: boolean;
	withHardMute?: boolean;
}>(), {
	mock: false,
});

provide('mock', props.mock);

const emit = defineEmits<{
	(ev: 'reaction', emoji: string): void;
	(ev: 'removeReaction', emoji: string): void;
}>();

const router = useRouter();

const inTimeline = inject<boolean>('inTimeline', false);
const inChannel = inject('inChannel', null);
const currentClip = inject<Ref<Misskey.entities.Clip> | null>('currentClip', null);

const note = ref(deepClone(props.note));

function noteclick(id: string) {
	const selection = document.getSelection();
	if (selection?.toString().length === 0) {
		router.push(`/notes/${id}`);
	}
}

// plugin
if (noteViewInterruptors.length > 0) {
	onMounted(async () => {
		let result: Misskey.entities.Note | null = deepClone(note.value);
		for (const interruptor of noteViewInterruptors) {
			try {
				result = await interruptor.handler(result!) as Misskey.entities.Note | null;
				if (result === null) {
					isDeleted.value = true;
					return;
				}
			} catch (err) {
				console.error(err);
			}
		}
		note.value = result as Misskey.entities.Note;
	});
}

const isRenote = Misskey.note.isPureRenote(note.value);

const rootEl = shallowRef<HTMLElement>();
const menuButton = shallowRef<HTMLElement>();
const menuVersionsButton = shallowRef<HTMLElement>();
const renoteButton = shallowRef<HTMLElement>();
const renoteTime = shallowRef<HTMLElement>();
const reactButton = shallowRef<HTMLElement>();
const quoteButton = shallowRef<HTMLElement>();
const clipButton = shallowRef<HTMLElement>();
const likeButton = shallowRef<HTMLElement>();
const appearNote = computed(() => spacingNote(getAppearNote(note.value)));
const galleryEl = shallowRef<InstanceType<typeof MkMediaList>>();
const isMyRenote = $i && ($i.id === note.value.userId);
const showContent = ref(defaultStore.state.uncollapseCW);
const parsed = computed(() => appearNote.value.text ? mfm.parse(appearNote.value.text) : null);
const urls = computed(() => parsed.value ? extractUrlFromMfm(parsed.value).filter((url) => appearNote.value.renote?.url !== url && appearNote.value.renote?.uri !== url) : null);
const isLong = shouldCollapsed(appearNote.value, urls.value ?? []);
const collapsed = ref(defaultStore.state.expandLongNote && appearNote.value.cw == null && isLong ? false : appearNote.value.cw == null && isLong);
const isDeleted = ref(false);
const renoted = ref(false);
const muted = ref(checkMute(appearNote.value, $i?.mutedWords));
const hardMuted = ref(props.withHardMute && checkMute(appearNote.value, $i?.hardMutedWords, true));
const translation = ref<Misskey.entities.NotesTranslateResponse | null>(null);
const translating = ref(false);
const showTicker = (defaultStore.state.instanceTicker === 'always') || (defaultStore.state.instanceTicker === 'remote' && appearNote.value.user.instance);
const canRenote = computed(() => ['public', 'home'].includes(appearNote.value.visibility) || (appearNote.value.visibility === 'followers' && appearNote.value.userId === $i?.id));
const renoteCollapsed = ref(
	defaultStore.state.collapseRenotes && isRenote && (
		($i && ($i.id === note.value.userId || $i.id === appearNote.value.userId)) || // `||` must be `||`! See https://github.com/misskey-dev/misskey/issues/13131
		(appearNote.value.myReaction != null)
	),
);
const inReplyToCollapsed = ref(defaultStore.state.collapseNotesRepliedTo);
const defaultLike = computed(() => defaultStore.state.like ? defaultStore.state.like : null);
const animated = computed(() => parsed.value ? checkAnimationFromMfm(parsed.value) : null);
const allowAnim = ref(defaultStore.state.advancedMfm && defaultStore.state.animatedMfm ? true : false);

const pleaseLoginContext = computed<OpenOnRemoteOptions>(() => ({
	type: 'lookup',
	url: `https://${host}/notes/${appearNote.value.id}`,
}));

/* Overload FunctionにLintが対応していないのでコメントアウト
function checkMute(noteToCheck: Misskey.entities.Note, mutedWords: Array<string | string[]> | undefined | null, checkOnly: true): boolean;
function checkMute(noteToCheck: Misskey.entities.Note, mutedWords: Array<string | string[]> | undefined | null, checkOnly: false): boolean | 'sensitiveMute';
*/
function checkMute(noteToCheck: Misskey.entities.Note, mutedWords: Array<string | string[]> | undefined | null, checkOnly = false): boolean | 'sensitiveMute' {
	if (mutedWords == null) return false;

	if (checkWordMute(noteToCheck, $i, mutedWords)) return true;
	if (noteToCheck.reply && checkWordMute(noteToCheck.reply, $i, mutedWords)) return true;
	if (noteToCheck.renote && checkWordMute(noteToCheck.renote, $i, mutedWords)) return true;

	if (checkOnly) return false;

	if (inTimeline && !defaultStore.state.tl.filter.withSensitive && noteToCheck.files?.some((v) => v.isSensitive)) return 'sensitiveMute';
	return false;
}

let renoting = false;

const keymap = {
	'r': () => {
		if (renoteCollapsed.value) return;
		reply();
	},
	'e|a|plus': () => {
		if (renoteCollapsed.value) return;
		react();
	},
	'q': () => {
		if (renoteCollapsed.value) return;
		if (canRenote.value && !renoted.value && !renoting) renote(defaultStore.state.visibilityOnBoost);
	},
	'm': () => {
		if (renoteCollapsed.value) return;
		showMenu();
	},
	'c': () => {
		if (renoteCollapsed.value) return;
		if (!defaultStore.state.showClipButtonInNoteFooter) return;
		clip();
	},
	'o': () => {
		if (renoteCollapsed.value) return;
		galleryEl.value?.openGallery();
	},
	'v|enter': () => {
		if (renoteCollapsed.value) {
			renoteCollapsed.value = false;
		} else if (appearNote.value.cw != null) {
			showContent.value = !showContent.value;
		} else if (isLong) {
			collapsed.value = !collapsed.value;
		}
	},
	'esc': {
		allowRepeat: true,
		callback: () => blur(),
	},
	'up|k|shift+tab': {
		allowRepeat: true,
		callback: () => focusBefore(),
	},
	'down|j|tab': {
		allowRepeat: true,
		callback: () => focusAfter(),
	},
} as const satisfies Keymap;

provide('react', (reaction: string) => {
	misskeyApi('notes/reactions/create', {
		noteId: appearNote.value.id,
		reaction: reaction,
	});
});

if (props.mock) {
	watch(() => props.note, (to) => {
		note.value = deepClone(to);
	}, { deep: true });
} else {
	useNoteCapture({
		rootEl: rootEl,
		note: appearNote,
		pureNote: note,
		isDeletedRef: isDeleted,
		onReplyCallback: () => {
			appearNote.value.repliesCount += 1;
		},
	});
}

if (!props.mock) {
	useTooltip(renoteButton, async (showing) => {
		const renotes = await misskeyApi('notes/renotes', {
			noteId: appearNote.value.id,
			limit: 11,
		});

		const users = renotes.map(x => x.user);

		if (users.length < 1) return;

		const { dispose } = os.popup(MkUsersTooltip, {
			showing,
			users,
			count: appearNote.value.renoteCount,
			targetElement: renoteButton.value,
		}, {
			closed: () => dispose(),
		});
	});

	useTooltip(quoteButton, async (showing) => {
		const renotes = await misskeyApi('notes/renotes', {
			noteId: appearNote.value.id,
			limit: 11,
			quote: true,
		});

		const users = renotes.map(x => x.user);

		if (users.length < 1) return;

		const { dispose } = os.popup(MkUsersTooltip, {
			showing,
			users,
			count: appearNote.value.renoteCount,
			targetElement: quoteButton.value,
		}, {
			closed: () => dispose(),
		});
	});

	if ($i) {
		renoted.value = appearNote.value.renotedByMe || (isPureRenote(note.value) && note.value.userId === $i.id);
	}

	if (appearNote.value.reactionAcceptance === 'likeOnly') {
		useTooltip(reactButton, async (showing) => {
			const reactions = await misskeyApiGet('notes/reactions', {
				noteId: appearNote.value.id,
				limit: 10,
				_cacheKey_: appearNote.value.reactionCount,
			});

			const users = reactions.map(x => x.user);

			if (users.length < 1) return;

			const { dispose } = os.popup(MkReactionsViewerDetails, {
				showing,
				reaction: '❤️',
				users,
				count: appearNote.value.reactionCount,
				targetElement: reactButton.value!,
			}, {
				closed: () => dispose(),
			});
		});
	}
}

function boostVisibility() {
	if (renoting) return;

	if (!defaultStore.state.showVisibilitySelectorOnBoost) {
		renote(defaultStore.state.visibilityOnBoost);
	} else {
		os.popupMenu(boostMenuItems(appearNote, renote), renoteButton.value);
	}
}

function renote(visibility: Visibility, localOnly = false) {
	pleaseLogin(undefined, pleaseLoginContext.value);
	showMovedDialog();

	renoting = true;

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

		if (!props.mock) {
			misskeyApi('notes/create', {
				renoteId: appearNote.value.id,
				channelId: appearNote.value.channelId,
			}).then(() => {
				os.toast(i18n.ts.renoted);
				renoted.value = true;
			}).finally(() => { renoting = false; });
		}
	} else if (!appearNote.value.channel || appearNote.value.channel.allowRenoteToExternal) {
		const el = renoteButton.value as HTMLElement | null | undefined;
		if (el) {
			const rect = el.getBoundingClientRect();
			const x = rect.left + (el.offsetWidth / 2);
			const y = rect.top + (el.offsetHeight / 2);
			const { dispose } = os.popup(MkRippleEffect, { x, y }, {
				end: () => dispose(),
			});
		}

		if (!props.mock) {
			misskeyApi('notes/create', {
				localOnly: localOnly,
				visibility: visibility,
				renoteId: appearNote.value.id,
			}).then(() => {
				os.toast(i18n.ts.renoted);
				renoted.value = true;
				appearNote.value.renoteCount += 1;
			}).finally(() => { renoting = false; });
		}
	}
}

function quote() {
	pleaseLogin(undefined, pleaseLoginContext.value);
	showMovedDialog();
	if (props.mock) {
		return;
	}

	if (appearNote.value.channel) {
		os.post({
			renote: appearNote.value,
			channel: appearNote.value.channel,
		}).then((cancelled) => {
			if (cancelled) return;
			misskeyApi('notes/renotes', {
				noteId: appearNote.value.id,
				userId: $i?.id,
				limit: 1,
				quote: true,
			}).then((res) => {
				if (!(res.length > 0)) return;
				const el = quoteButton.value as HTMLElement | null | undefined;
				if (el && res.length > 0) {
					const rect = el.getBoundingClientRect();
					const x = rect.left + (el.offsetWidth / 2);
					const y = rect.top + (el.offsetHeight / 2);
					const { dispose } = os.popup(MkRippleEffect, { x, y }, {
						end: () => dispose(),
					});
				}

				os.toast(i18n.ts.quoted);
			});
		});
	} else {
		os.post({
			renote: appearNote.value,
		}).then((cancelled) => {
			if (cancelled) return;
			misskeyApi('notes/renotes', {
				noteId: appearNote.value.id,
				userId: $i?.id,
				limit: 1,
				quote: true,
			}).then((res) => {
				if (!(res.length > 0)) return;
				const el = quoteButton.value as HTMLElement | null | undefined;
				if (el && res.length > 0) {
					const rect = el.getBoundingClientRect();
					const x = rect.left + (el.offsetWidth / 2);
					const y = rect.top + (el.offsetHeight / 2);
					const { dispose } = os.popup(MkRippleEffect, { x, y }, {
						end: () => dispose(),
					});
				}

				os.toast(i18n.ts.quoted);
			});
		});
	}
}

function reply(): void {
	pleaseLogin(undefined, pleaseLoginContext.value);
	if (props.mock) {
		return;
	}
	os.post({
		reply: appearNote.value,
		channel: appearNote.value.channel,
	}).then(() => {
		focus();
	});
}

function like(): void {
	pleaseLogin(undefined, pleaseLoginContext.value);
	showMovedDialog();
	sound.playMisskeySfx('reaction');
	if (props.mock) {
		return;
	}
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

function react(viaKeyboard = false): void {
	pleaseLogin(undefined, pleaseLoginContext.value);
	showMovedDialog();
	if (appearNote.value.reactionAcceptance === 'likeOnly') {
		sound.playMisskeySfx('reaction');

		if (props.mock) {
			return;
		}

		misskeyApi('notes/like', {
			noteId: appearNote.value.id,
			override: defaultLike.value,
		});
		const el = reactButton.value;
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
		reactionPicker.show(reactButton.value ?? null, note.value, reaction => {
			sound.playMisskeySfx('reaction');

			if (props.mock) {
				emit('reaction', reaction);
				return;
			}

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

function undoReact(targetNote: Misskey.entities.Note): void {
	const oldReaction = targetNote.myReaction;
	if (!oldReaction) return;

	if (props.mock) {
		emit('removeReaction', oldReaction);
		return;
	}

	misskeyApi('notes/reactions/delete', {
		noteId: targetNote.id,
	});
}

function undoRenote(note) : void {
	if (props.mock) {
		return;
	}
	misskeyApi('notes/unrenote', {
		noteId: note.id,
	});
	os.toast(i18n.ts.rmboost);
	renoted.value = false;

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

function toggleReact() {
	if (appearNote.value.myReaction == null) {
		react();
	} else {
		undoReact(appearNote.value);
	}
}

function onContextmenu(ev: MouseEvent): void {
	if (props.mock) {
		return;
	}

	const isLink = (el: HTMLElement): boolean => {
		if (el.tagName === 'A') return true;
		// 再生速度の選択などのために、Audio要素のコンテキストメニューはブラウザデフォルトとする。
		if (el.tagName === 'AUDIO') return true;
		if (el.parentElement) {
			return isLink(el.parentElement);
		}
		return false;
	};

	if (ev.target && isLink(ev.target as HTMLElement)) return;
	if (window.getSelection()?.toString() !== '') return;

	if (defaultStore.state.useReactionPickerForContextMenu) {
		ev.preventDefault();
		react();
	} else {
		const { menu, cleanup } = getNoteMenu({ note: note.value, translating, translation, isDeleted, currentClip: currentClip?.value });
		os.contextMenu(menu, ev).then(focus).finally(cleanup);
	}
}

function showMenu(): void {
	if (props.mock) {
		return;
	}

	const { menu, cleanup } = getNoteMenu({ note: note.value, translating, translation, isDeleted, currentClip: currentClip?.value });
	os.popupMenu(menu, menuButton.value).then(focus).finally(cleanup);
}

async function menuVersions(viaKeyboard = false): Promise<void> {
	const { menu, cleanup } = await getNoteVersionsMenu({ note: note.value, menuVersionsButton });
	os.popupMenu(menu, menuVersionsButton.value, {
		viaKeyboard,
	}).then(focus).finally(cleanup);
}

async function clip(): Promise<void> {
	if (props.mock) {
		return;
	}

	os.popupMenu(await getNoteClipMenu({ note: note.value, isDeleted, currentClip: currentClip?.value }), clipButton.value).then(focus);
}

function showRenoteMenu(): void {
	if (props.mock) {
		return;
	}

	function getUnrenote(): MenuItem {
		return {
			text: i18n.ts.unrenote,
			icon: 'ti ti-trash',
			danger: true,
			action: () => {
				misskeyApi('notes/delete', {
					noteId: note.value.id,
				});
				isDeleted.value = true;
			},
		};
	}

	if (isMyRenote) {
		pleaseLogin(undefined, pleaseLoginContext.value);
		os.popupMenu([
			getCopyNoteLinkMenu(note.value, i18n.ts.copyLinkRenote),
			{ type: 'divider' },
			getUnrenote(),
		], renoteTime.value);
	} else {
		os.popupMenu([
			getCopyNoteLinkMenu(note.value, i18n.ts.copyLinkRenote),
			{ type: 'divider' },
			getAbuseNoteMenu(note.value, i18n.ts.reportAbuseRenote),
			($i?.isModerator || $i?.isAdmin) ? getUnrenote() : undefined,
		], renoteTime.value);
	}
}

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

function focus() {
	rootEl.value?.focus();
}

function blur() {
	rootEl.value?.blur();
}

function focusBefore() {
	focusPrev(rootEl.value);
}

function focusAfter() {
	focusNext(rootEl.value);
}

function readPromo() {
	misskeyApi('promo/read', {
		noteId: appearNote.value.id,
	});
	isDeleted.value = true;
}

function emitUpdReaction(emoji: string, delta: number) {
	if (delta < 0) {
		emit('removeReaction', emoji);
	} else if (delta > 0) {
		emit('reaction', emoji);
	}
}
</script>

<style lang="scss" module>
.root {
	position: relative;
	transition: box-shadow 0.1s ease;
	font-size: 1.05em;
	overflow: clip;
	contain: content;

	// これらの指定はパフォーマンス向上には有効だが、ノートの高さは一定でないため、
	// 下の方までスクロールすると上のノートの高さがここで決め打ちされたものに変化し、表示しているノートの位置が変わってしまう
	// ノートがマウントされたときに自身の高さを取得し contain-intrinsic-size を設定しなおせばほぼ解決できそうだが、
	// 今度はその処理自体がパフォーマンス低下の原因にならないか懸念される。また、被リアクションでも高さは変化するため、やはり多少のズレは生じる
	// 一度レンダリングされた要素はブラウザがよしなにサイズを覚えておいてくれるような実装になるまで待った方が良さそう(なるのか？)
	//content-visibility: auto;
  //contain-intrinsic-size: 0 128px;

	&:focus-visible {
		outline: none;

		&::after {
			content: "";
			pointer-events: none;
			display: block;
			position: absolute;
			z-index: 10;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			margin: auto;
			width: calc(100% - 8px);
			height: calc(100% - 8px);
			border: solid 2px var(--focus);
			border-radius: var(--radius);
			box-sizing: border-box;
		}
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

	&:hover > .article > .main > .footer > .footerButton {
		opacity: 1;
	}

	&.showActionsOnlyHover {
		.footer {
			visibility: hidden;
			position: absolute;
			top: 12px;
			right: 12px;
			padding: 0 4px;
			margin-bottom: 0 !important;
			background: var(--popup);
			border-radius: var(--radius-sm);
			box-shadow: 0px 4px 32px var(--shadow);
		}

		.footerButton {
			font-size: 90%;

			&:not(:last-child) {
				margin-right: 0;
			}
		}
	}

	&.showActionsOnlyHover:hover {
		.footer {
			visibility: visible;
		}
	}
}

.tip {
	display: flex;
	align-items: center;
	padding: 16px 32px 8px 32px;
	line-height: 24px;
	font-size: 90%;
	white-space: pre;
	color: #d28a3f;
}

.tip + .article {
	padding-top: 8px;
}

.replyTo {
	padding-bottom: 0;
}

.renote {
	position: relative;
	display: flex;
	align-items: center;
	padding: 24px 32px 0 calc(32px + var(--avatar) + 14px);
	line-height: 28px;
	white-space: pre;
	color: var(--renote);

	&::before {
		content: '';
		position: absolute;
		top: 0;
		left: calc(32px + .5 * var(--avatar));
		bottom: -8px;
		border-left: var(--thread-width) solid var(--thread);
	}

	&:first-child {
		padding-left: 32px;

		&::before {
			display: none;
		}
	}

	& + .article {
		padding-top: 8px;
	}

	> .colorBar {
		height: calc(100% - 6px);
	}
}

.renoteAvatar {
	flex-shrink: 0;
	// display: none; /* same as Firefish ner version, but keeping the element around in case someone wants to add it back via CSS override */
	width: 28px;
	height: 28px;
	margin: 0 8px 0 0;
}

.renoteText {
	overflow: hidden;
	flex-shrink: 1;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.renoteUserName {
	font-weight: bold;
}

.renoteInfo {
	margin-left: auto;
	font-size: 0.9em;
}

.renoteTime {
	flex-shrink: 0;
	color: inherit;
}

.renoteMenu {
	margin-right: 4px;
}

.collapsedRenoteTarget, .collapsedInReplyTo {
	display: flex;
	align-items: center;
	line-height: 28px;
	white-space: pre;
	padding: 8px 38px 24px;
}

.collapsedInReplyTo {
	padding: 28px 44px 0;
}

.collapsedRenoteTargetAvatar, .collapsedInReplyToAvatar {
	flex-shrink: 0;
	display: inline-block;
	width: 28px;
	height: 28px;
	margin: 0 8px 0 0;
}

.collapsedRenoteTargetText, .collapsedInReplyToText {
	overflow: hidden;
	flex-shrink: 1;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 90%;
	opacity: 0.7;
	cursor: pointer;

	&:hover {
		text-decoration: underline;
	}
}

.collapsedInReplyToLine {
	position: absolute;
	left: calc(32px + .5 * var(--avatar));
	// using solid instead of dotted, stylelistic choice
	border-left: var(--thread-width) solid var(--thread);
	top: calc(28px + 28px); // 28px of .root padding, plus 28px of avatar height (see SkNote)
	height: 28px;
}

.article {
	position: relative;
	padding: 28px 32px;
}

.colorBar {
	position: absolute;
	top: 8px;
	left: 8px;
	width: 5px;
	height: calc(100% - 16px);
	border-radius: var(--radius-ellipse);
	pointer-events: none;
}

.avatar {
	flex-shrink: 0;
	display: block !important;
	position: sticky !important;
	margin: 0 14px 0 0;
	width: var(--avatar);
	height: var(--avatar);
	position: sticky !important;
	top: calc(22px + var(--stickyTop, 0px));
	left: 0;
	transition: top 0.5s;

	&.avatarReplyTo {
		position: relative !important;
		top: 0 !important;
	}
}

.main {
	flex: 1;
	min-width: 0;
}

.cw {
	display: block;
	margin: 0;
	padding: 0;
	overflow-wrap: break-word;
}

.showLess {
	width: 100%;
	margin-top: 14px;
	position: sticky;
	bottom: calc(var(--stickyBottom, 0px) - 100px);
}

.showLessLabel {
	display: inline-block;
	background: var(--popup);
	padding: 6px 10px;
	font-size: 0.8em;
	border-radius: var(--radius-ellipse);
	box-shadow: 0 2px 6px rgb(0 0 0 / 20%);
}

.contentCollapsed {
	position: relative;
	max-height: 9em;
	overflow: clip;
}

.collapsed {
	display: block;
	position: absolute;
	bottom: 0;
	left: 0;
	z-index: 2;
	width: 100%;
	height: 64px;
	//background: linear-gradient(0deg, var(--panel), var(--X15));

	&:hover > .collapsedLabel {
		background: var(--panelHighlight);
	}
}

.collapsedLabel {
	display: inline-block;
	background: var(--panel);
	padding: 6px 10px;
	font-size: 0.8em;
	border-radius: var(--radius-ellipse);
	box-shadow: 0 2px 6px rgb(0 0 0 / 20%);
}

.text {
	overflow-wrap: break-word;
}

.replyIcon {
	color: var(--accent);
	margin-right: 0.5em;
}

.translation {
	border: solid 0.5px var(--divider);
	border-radius: var(--radius);
	padding: 12px;
	margin-top: 8px;
}

.urlPreview {
	margin-top: 8px;
}

.playMFMButton {
	margin-top: 5px;
}

.poll {
	font-size: 80%;
}

.quote {
	padding: 8px 0;
}

.quoteNote {
	padding: 16px;
	// Made border solid, stylistic choice
	border: solid 1px var(--renote);
	border-radius: var(--radius-sm);
	overflow: clip;
}

.channel {
	opacity: 0.7;
	font-size: 80%;
}

.footer {
	margin-bottom: -14px;
}

.footerButton {
	margin: 0;
	padding: 8px;
	opacity: 0.7;

	&:not(:last-child) {
		margin-right: 1.5em;
	}

	&:hover {
		color: var(--fgHighlighted);
	}
}

.footerButtonCount {
	display: inline;
	margin: 0 0 0 8px;
	opacity: 0.7;
}

@container (max-width: 580px) {
	.root {
		font-size: 1em;
		--avatar: 46px;
	}

	.renote {
		padding: 24px 26px 0 calc(26px + var(--avatar) + 14px);

		&::before {
			left: calc(26px + .5 * var(--avatar));
		}
	}

	.collapsedRenoteTarget {
		padding: 8px 26px 24px;
	}

	.collapsedInReplyTo {
		padding: 28px 35px 0;
	}

	.collapsedInReplyToLine {
		left: calc(26px + .5 * var(--avatar));
	}

	.article {
		padding: 24px 26px;
	}
}

@container (max-width: 380px) {
	.root {
		font-size: 0.9em;
	}

	.article {
		padding: 23px 25px;
	}

	.footer {
		margin-bottom: -8px;
	}

	.collapsedInReplyToLine {
		left: calc(25px + .5 * var(--avatar));
	}
}

@container (max-width: 500px) {
	.renote {
		padding: 23px 25px 0 calc(25px + var(--avatar) + 14px);

		&::before {
			left: calc(25px + .5 * var(--avatar));
		}
	}
}

@container (max-width: 480px) {
	.renote {
		padding: 22px 24px 0 calc(24px + var(--avatar) + 14px);

		&::before {
			left: calc(24px + .5 * var(--avatar));
		}
	}

	.tip {
		padding: 8px 16px 0 16px;
	}

	.collapsedRenoteTarget {
		padding: 8px 24px 20px;
		margin-top: 4px;
	}

	.collapsedInReplyTo {
		padding: 22px 33px 0;
	}

	.collapsedInReplyToLine {
		left: calc(24px + .5 * var(--avatar));
		top: calc(22px + 28px); // 22px of .root padding, plus 28px of avatar height
	}

	.article {
		padding: 22px 24px;
	}
}

@container (max-width: 450px) {
	.root {
		--avatar: 44px;
	}

	.avatar {
		margin: 0 10px 0 0;
		top: calc(14px + var(--stickyTop, 0px));
	}
}

@container (max-width: 580px) {
	.root:not(.showActionsOnlyHover) {
		.footerButton {
			&:not(:last-child) {
				margin-right: 0.2em;
			}
		}
	}
}

@container (max-width: 350px) {
	.root:not(.showActionsOnlyHover) {
		.footerButton {
			&:not(:last-child) {
				margin-right: 0.1em;
			}
		}
	}

	.colorBar {
		top: 6px;
		left: 6px;
		width: 4px;
		height: calc(100% - 12px);
	}
}

@container (max-width: 300px) {
	.root:not(.showActionsOnlyHover) {
		.footerButton {
			&:not(:last-child) {
				margin-right: 0.1em;
			}
		}
	}
}

@container (max-width: 250px) {
	.quoteNote {
		padding: 12px;
	}
}

.muted {
	padding: 8px;
	text-align: center;
	opacity: 0.7;
}

.reactionOmitted {
	display: inline-block;
	margin-left: 8px;
	opacity: .8;
	font-size: 95%;
}

.clickToOpen {
	cursor: pointer;
	-webkit-tap-highlight-color: transparent;
}
</style>
