<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only

Displays a note in the Sharkey style. Used to show the "main" note in a given context.
-->

<template>
<div
	v-if="!hardMuted && muted === false && !threadMuted && !noteMuted"
	v-show="!isDeleted"
	ref="rootEl"
	v-hotkey="keymap"
	:class="[$style.root, { [$style.showActionsOnlyHover]: prefer.s.showNoteActionsOnlyHover, [$style.skipRender]: prefer.s.skipNoteRender }, ...stpvNoteClassBindings(note)]"
	:tabindex="isDeleted ? '-1' : '0'"
>
	<SkNoteSub v-if="appearNote.reply" v-show="!renoteCollapsed && !inReplyToCollapsed" :note="appearNote.reply" :class="$style.replyTo"/>
	<div v-if="appearNote.reply && inReplyToCollapsed && !renoteCollapsed" :class="$style.collapsedInReplyTo">
		<div :class="$style.collapsedInReplyToLine"></div>
		<MkAvatar :class="$style.collapsedInReplyToAvatar" :user="appearNote.reply.user" link preview/>
		<MkAcct v-if="!stpvHideReplyAcct" :user="appearNote.reply.user" :class="$style.collapsedInReplyToText" @click="inReplyToCollapsed = false"/>:
		<Mfm :text="getNoteSummary(appearNote.reply)" :stpvInline="true" :nowrap="true" :author="appearNote.reply.user" :nyaize="'respect'" :class="$style.collapsedInReplyToText" @click="inReplyToCollapsed = false"/>
	</div>
	<div v-if="pinned" :class="$style.tip"><i class="ti ti-pin"></i> {{ i18n.ts.pinnedNote }}</div>
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
		<Mfm :text="getNoteSummary(appearNote)" :isBlock="true" :stpvInline="true" :nowrap="true" :author="appearNote.user" :nyaize="'respect'" :class="$style.collapsedRenoteTargetText" @click="renoteCollapsed = false; inReplyToCollapsed = false"/>
	</div>
	<article v-else :class="$style.article" @contextmenu.stop="onContextmenu">
		<div style="display: flex; padding-bottom: 10px;">
			<div v-if="appearNote.channel" :class="$style.colorBar" :style="{ background: appearNote.channel.color }"></div>
			<MkAvatar :class="[$style.avatar, { [$style.avatarReplyTo]: appearNote.reply }]" :user="appearNote.user" :link="!mock" :preview="!mock"/>
			<div :class="$style.main">
				<SkNoteHeader :note="appearNote" :mini="true"/>
			</div>
		</div>
		<div :class="[{ [$style.clickToOpen]: prefer.s.clickToOpen }]" @click.stop="prefer.s.clickToOpen ? noteclick(appearNote.id) : undefined">
			<div style="container-type: inline-size;">
				<p v-if="mergedCW != null" :class="$style.cw">
					<Mfm
						v-if="mergedCW != ''"
						:text="mergedCW"
						:author="appearNote.user"
						:nyaize="'respect'"
						:enableEmojiMenu="true"
						:enableEmojiMenuReaction="true"
						:isBlock="true"
						class="_selectable"
					/>
					<MkCwButton v-model="showContent" :text="appearNote.text" :renote="appearNote.renote" :files="appearNote.files" :poll="appearNote.poll" style="margin: 4px 0;" @click.stop/>
				</p>
				<div v-show="mergedCW == null || showContent" :class="[{ [$style.contentCollapsed]: collapsed }]">
					<div :class="$style.text">
						<span v-if="appearNote.isHidden" style="opacity: 0.5">
							({{ i18n.ts.private }})
							<code v-if="prefer.s.devMode">{{ appearNote.hiddenReason }}</code>
						</span>
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
						<SkNoteTranslation :note="note" :translation="translation" :translating="translating"></SkNoteTranslation>
						<MkButton v-if="!allowAnim && animated" :class="$style.playMFMButton" :small="true" @click="animatedMFM()" @click.stop><i class="ph-play ph-bold ph-lg "></i> {{ i18n.ts._animatedMFM.play }}</MkButton>
						<MkButton v-else-if="!prefer.s.animatedMfm && allowAnim && animated" :class="$style.playMFMButton" :small="true" @click="animatedMFM()" @click.stop><i class="ph-stop ph-bold ph-lg "></i> {{ i18n.ts._animatedMFM.stop }}</MkButton>
					</div>
					<div v-if="appearNote.files && appearNote.files.length > 0">
						<MkMediaList ref="galleryEl" :mediaList="appearNote.files" @click.stop/>
					</div>
					<MkPoll v-if="appearNote.poll" :noteId="appearNote.id" :poll="appearNote.poll" :local="!appearNote.user.host" :author="appearNote.user" :emojiUrls="appearNote.emojis" :class="$style.poll" @click.stop/>
					<div v-if="isEnabledUrlPreview" :class="[$style.urlPreview, '_gaps_s']" @click.stop>
						<SkUrlPreviewGroup :sourceUrls="urls" :sourceNote="appearNote" :compact="true" :detail="false" :showAsQuote="!appearNote.user.rejectQuotes" :skipNoteIds="selfNoteIds"/>
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
			<MkReactionsViewer v-if="appearNote.reactionAcceptance !== 'likeOnly' && !store.s.stpvDisableAllReactions" :note="appearNote" :maxNumber="16" @click.stop @mockUpdateMyReaction="emitUpdReaction">
				<template #more>
					<MkA :to="`/notes/${appearNote.id}/reactions`" :class="[$style.reactionOmitted]">{{ i18n.ts.more }}</MkA>
				</template>
			</MkReactionsViewer>
			<footer :class="$style.footer" class="_gaps _h_gaps" tabindex="0" role="group" :aria-label="i18n.ts.noteFooterLabel">
				<button :class="$style.footerButton" class="_button" @click.stop @click="reply()">
					<i class="ti ti-arrow-back-up"></i>
					<p v-if="appearNote.repliesCount > 0" :class="$style.footerButtonCount">{{ number(appearNote.repliesCount) }}</p>
				</button>
				<button
					v-if="canRenote"
					ref="renoteButton"
					v-tooltip="renoteTooltip"
					:class="$style.footerButton"
					class="_button"
					:style="appearNote.isRenoted ? 'color: var(--MI_THEME-accent) !important;' : ''"
					@click.stop
					@mousedown.prevent="appearNote.isRenoted ? undoRenote(appearNote) : boostVisibility($event.shiftKey)"
				>
					<i class="ti ti-repeat"></i>
					<p v-if="appearNote.renoteCount > 0" :class="$style.footerButtonCount">{{ number(appearNote.renoteCount) }}</p>
				</button>
				<button v-else :class="$style.footerButton" class="_button" disabled>
					<i class="ti ti-ban"></i>
				</button>
				<button
					v-if="canRenote && !props.mock && !$i?.rejectQuotes"
					ref="quoteButton"
					:class="$style.footerButton"
					class="_button"
					@click.stop
					@mousedown="quote()"
				>
					<i class="ph-quotes ph-bold ph-lg"></i>
				</button>
				<button v-if="appearNote.myReaction == null && appearNote.reactionAcceptance !== 'likeOnly' && !stpvDisableReactions" ref="likeButton" :class="$style.footerButton" class="_button" @click.stop @click="like()">
					<i class="ph-heart ph-bold ph-lg"></i>
				</button>
				<button ref="reactButton" :class="$style.footerButton" class="_button" @click.stop="toggleReact()">
					<i v-if="(appearNote.reactionAcceptance === 'likeOnly' || stpvDisableReactions) && appearNote.myReaction != null" class="ti ti-heart-filled" style="color: var(--MI_THEME-love);"></i>
					<i v-else-if="appearNote.myReaction != null" class="ti ti-minus" style="color: var(--MI_THEME-accent);"></i>
					<i v-else-if="appearNote.reactionAcceptance === 'likeOnly' || stpvDisableReactions" class="ti ti-heart"></i>
					<i v-else class="ph-smiley ph-bold ph-lg"></i>
					<p v-if="(appearNote.reactionAcceptance === 'likeOnly' || stpvDisableReactions || prefer.s.showReactionsCount) && appearNote.reactionCount > 0" :class="$style.footerButtonCount">{{ number(appearNote.reactionCount) }}</p>
				</button>
				<button v-if="prefer.s.showClipButtonInNoteFooter" ref="clipButton" :class="$style.footerButton" class="_button" @click.stop="clip()">
					<i class="ti ti-paperclip"></i>
				</button>
				<button v-if="prefer.s.showTranslationButtonInNoteFooter && policies.canUseTranslator && instance.translatorAvailable" class="_button" :class="$style.footerButton" :disabled="translating || !!translation" @click.stop="translate()">
					<i class="ti ti-language-hiragana"></i>
				</button>
				<button ref="menuButton" :class="$style.footerButton" class="_button" @click.stop="showMenu()">
					<i class="ti ti-dots"></i>
				</button>
			</footer>
		</div>
	</article>
</div>
<div v-else-if="!hardMuted" :class="$style.muted" @click.stop="muted = false">
	<SkMutedNote :muted="muted" :threadMuted="threadMuted" :noteMuted="noteMuted" :note="appearNote"></SkMutedNote>
</div>
<div v-else>
	<!--
		MkDateSeparatedList uses TransitionGroup which requires single element in the child elements
		so MkNote create empty div instead of no elements
	-->
</div>
</template>

<script lang="ts" setup>
import { computed, inject, onMounted, ref, useTemplateRef, watch, provide } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { isPureRenote } from 'misskey-js/note.js';
import { isLink } from '@@/js/is-link.js';
import { shouldCollapsed } from '@@/js/collapsed.js';
import { host } from '@@/js/config.js';
import SkInstanceTicker from './SkInstanceTicker.vue';
import * as config from '@@/js/config.js';
import { computeMergedCw } from '@@/js/compute-merged-cw.js';
import type { Ref } from 'vue';
import type { MenuItem } from '@/types/menu.js';
import type { OpenOnRemoteOptions } from '@/utility/please-login.js';
import type { Keymap } from '@/utility/hotkey.js';
import type { Visibility } from '@/utility/boost-quote.js';
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
import { pleaseLogin } from '@/utility/please-login.js';
import { checkMutes } from '@/utility/check-word-mute.js';
import { notePage } from '@/filters/note.js';
import { userPage } from '@/filters/user.js';
import number from '@/filters/number.js';
import * as os from '@/os.js';
import * as sound from '@/utility/sound.js';
import { misskeyApi, misskeyApiGet } from '@/utility/misskey-api.js';
import { reactionPicker } from '@/utility/reaction-picker.js';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';
import { checkAnimationFromMfm } from '@/utility/check-animated-mfm.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { getAbuseNoteMenu, getCopyNoteLinkMenu, getNoteClipMenu, getNoteMenu, translateNote } from '@/utility/get-note-menu.js';
import { getNoteVersionsMenu } from '@/utility/get-note-versions-menu.js';
import { useNoteCapture } from '@/use/use-note-capture.js';
import { deepClone } from '@/utility/clone.js';
import { useTooltip } from '@/use/use-tooltip.js';
import { claimAchievement } from '@/utility/achievements.js';
import { getNoteSummary } from '@/utility/get-note-summary.js';
import MkRippleEffect from '@/components/MkRippleEffect.vue';
import { showMovedDialog } from '@/utility/show-moved-dialog.js';
import { boostMenuItems, computeRenoteTooltip } from '@/utility/boost-quote.js';
import { spacingNote } from '@/utility/autospacing';
import { stpvNoteClassBindings } from '@/utility/stpv-note-class-bindings';
import { instance, isEnabledUrlPreview, policies } from '@/instance.js';
import { focusPrev, focusNext } from '@/utility/focus.js';
import { getAppearNote } from '@/utility/get-appear-note.js';
import { prefer } from '@/preferences.js';
import { getPluginHandlers } from '@/plugin.js';
import { DI } from '@/di.js';
import { useRouter } from '@/router.js';
import { store } from '@/store';
import SkMutedNote from '@/components/SkMutedNote.vue';
import SkNoteTranslation from '@/components/SkNoteTranslation.vue';
import { getSelfNoteIds } from '@/utility/get-self-note-ids.js';
import { extractPreviewUrls } from '@/utility/extract-preview-urls.js';
import SkUrlPreviewGroup from '@/components/SkUrlPreviewGroup.vue';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	pinned?: boolean;
	mock?: boolean;
	withHardMute?: boolean;
}>(), {
	mock: false,
});

provide(DI.mock, props.mock);

const emit = defineEmits<{
	(ev: 'reaction', emoji: string): void;
	(ev: 'removeReaction', emoji: string): void;
}>();

const router = useRouter();

const inChannel = inject('inChannel', null);
const currentClip = inject<Ref<Misskey.entities.Clip> | null>('currentClip', null);

const note = ref(deepClone(props.note));

function noteclick(id: string) {
	const selection = window.document.getSelection();
	if (selection?.toString().length === 0) {
		router.push(`/notes/${id}`);
	}
}

// plugin
const noteViewInterruptors = getPluginHandlers('note_view_interruptor');
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

const rootEl = useTemplateRef('rootEl');
const menuButton = useTemplateRef('menuButton');
const renoteButton = useTemplateRef('renoteButton');
const renoteTime = useTemplateRef('renoteTime');
const reactButton = useTemplateRef('reactButton');
const clipButton = useTemplateRef('clipButton');
const menuVersionsButton = useTemplateRef('menuVersionsButton');
const quoteButton = useTemplateRef('quoteButton');
const likeButton = useTemplateRef('likeButton');
const appearNote = computed(() => spacingNote(getAppearNote(note.value)));
const galleryEl = useTemplateRef('galleryEl');
const isMyRenote = $i && ($i.id === note.value.userId);
const showContent = ref(prefer.s.uncollapseCW);
const parsed = computed(() => appearNote.value.text ? mfm.parse(appearNote.value.text) : null);
const urls = computed(() => parsed.value ? extractPreviewUrls(appearNote.value, parsed.value) : []);
const selfNoteIds = computed(() => getSelfNoteIds(props.note));
const isLong = shouldCollapsed(appearNote.value, urls.value);
const collapsed = ref(prefer.s.expandLongNote && appearNote.value.cw == null && isLong ? false : appearNote.value.cw == null && isLong);
const isDeleted = ref(false);
const { muted, hardMuted, threadMuted, noteMuted } = checkMutes(appearNote, computed(() => props.withHardMute));
const translation = ref<Misskey.entities.NotesTranslateResponse | false | null>(null);
const translating = ref(false);
const showTicker = (prefer.s.instanceTicker === 'always') || (prefer.s.instanceTicker === 'remote' && appearNote.value.user.instance);
const canRenote = computed(() => ['public', 'home'].includes(appearNote.value.visibility) || (appearNote.value.visibility === 'followers' && appearNote.value.userId === $i?.id));
const renoteCollapsed = ref(
	prefer.s.collapseRenotes && isRenote && (
		($i && ($i.id === note.value.userId || $i.id === appearNote.value.userId)) || // `||` must be `||`! See https://github.com/misskey-dev/misskey/issues/13131
		(appearNote.value.myReaction != null) ||
		(appearNote.value.isFavorited) ||
		(appearNote.value.isRenoted)
	),
);
const inReplyToCollapsed = ref(prefer.s.collapseNotesRepliedTo);
const defaultLike = computed(() => prefer.s.like ? prefer.s.like : null);
const animated = computed(() => parsed.value ? checkAnimationFromMfm(parsed.value) : null);
const allowAnim = ref(prefer.s.advancedMfm && prefer.s.animatedMfm);

const pleaseLoginContext = computed<OpenOnRemoteOptions>(() => ({
	type: 'lookup',
	url: appearNote.value.url ?? appearNote.value.uri ?? `${config.url}/notes/${appearNote.value.id}`,
}));

const stpvDisableReactions = store.r.stpvDisableAllReactions;
const stpvHideReplyAcct = store.r.stpvHideReplyAcct;
const mergedCW = computed(() => computeMergedCw(appearNote.value));

const renoteTooltip = computeRenoteTooltip(appearNote);

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
		if (canRenote.value && !appearNote.value.isRenoted && !renoting) renote(prefer.s.visibilityOnBoost);
	},
	'm': () => {
		if (renoteCollapsed.value) return;
		showMenu();
	},
	'c': () => {
		if (renoteCollapsed.value) return;
		if (!prefer.s.showClipButtonInNoteFooter) return;
		clip();
	},
	't': () => {
		if (prefer.s.showTranslationButtonInNoteFooter && policies.value.canUseTranslator && instance.translatorAvailable) {
			translate();
		}
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

provide(DI.mfmEmojiReactCallback, (reaction) => {
	sound.playMisskeySfx('reaction');
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
		if (!renoteButton.value) return;

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
		if (!quoteButton.value) return;

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

	if (appearNote.value.reactionAcceptance === 'likeOnly' || store.s.stpvDisableAllReactions) {
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

function boostVisibility(forceMenu: boolean = false) {
	if (renoting) return;

	if (!prefer.s.showVisibilitySelectorOnBoost && !forceMenu) {
		renote(prefer.s.visibilityOnBoost);
	} else {
		os.popupMenu(boostMenuItems(appearNote, renote), renoteButton.value);
	}
}

function renote(visibility: Visibility, localOnly: boolean = false) {
	pleaseLogin({ openOnRemote: pleaseLoginContext.value });
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
				appearNote.value.isRenoted = true;
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
				appearNote.value.renoteCount += 1;
				appearNote.value.isRenoted = true;
			}).finally(() => { renoting = false; });
		}
	}
}

function quote() {
	pleaseLogin({ openOnRemote: pleaseLoginContext.value });
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
	pleaseLogin({ openOnRemote: pleaseLoginContext.value });
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
	pleaseLogin({ openOnRemote: pleaseLoginContext.value });
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
	if (el && prefer.s.animation) {
		const rect = el.getBoundingClientRect();
		const x = rect.left + (el.offsetWidth / 2);
		const y = rect.top + (el.offsetHeight / 2);
		const { dispose } = os.popup(MkRippleEffect, { x, y }, {
			end: () => dispose(),
		});
	}
}

function react(viaKeyboard = false): void {
	pleaseLogin({ openOnRemote: pleaseLoginContext.value });
	showMovedDialog();
	if (appearNote.value.reactionAcceptance === 'likeOnly' || store.s.stpvDisableAllReactions) {
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
		reactionPicker.show(reactButton.value ?? null, note.value, async (reaction) => {
			if (prefer.s.confirmOnReact) {
				const confirm = await os.confirm({
					type: 'question',
					text: i18n.tsx.reactAreYouSure({ emoji: reaction.replace('@.', '') }),
				});

				if (confirm.canceled) return;
			}

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
		blur();
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

	if (ev.target && isLink(ev.target as HTMLElement)) return;
	if (window.getSelection()?.toString() !== '') return;

	if (prefer.s.useReactionPickerForContextMenu) {
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

async function menuVersions(): Promise<void> {
	const { menu, cleanup } = await getNoteVersionsMenu({ note: note.value });
	os.popupMenu(menu, menuVersionsButton.value).then(focus).finally(cleanup);
}

async function clip(): Promise<void> {
	if (props.mock) {
		return;
	}

	os.popupMenu(await getNoteClipMenu({ note: note.value, isDeleted, currentClip: currentClip?.value }), clipButton.value).then(focus);
}

async function translate() {
	if (props.mock) return;

	await translateNote(appearNote.value.id, translation, translating);
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

	const renoteDetailsMenu: MenuItem = {
		type: 'link',
		text: i18n.ts.renoteDetails,
		icon: 'ti ti-info-circle',
		to: notePage(note.value),
	};

	if (isMyRenote) {
		pleaseLogin({ openOnRemote: pleaseLoginContext.value });
		os.popupMenu([
			renoteDetailsMenu,
			getCopyNoteLinkMenu(note.value, i18n.ts.copyLinkRenote),
			{ type: 'divider' },
			getUnrenote(),
		], renoteTime.value);
	} else {
		os.popupMenu([
			renoteDetailsMenu,
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
			border: solid 2px var(--MI_THEME-focus);
			border-radius: var(--MI-radius);
			box-sizing: border-box;
		}
	}

	.footer {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		position: relative;
		z-index: 1;
		margin-top: 0.4em;
		overflow-x: auto;
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
			background: var(--MI_THEME-popup);
			border-radius: var(--MI-radius-sm);
			box-shadow: 0px 4px 32px var(--MI_THEME-shadow);
		}

		.footerButton {
			font-size: 90%;
		}
	}

	&.showActionsOnlyHover:hover {
		.footer {
			visibility: visible;
		}
	}
}

.skipRender {
	// TODO: これが有効だとTransitionGroupでnoteを追加するときに一瞬がくっとなってしまうのをどうにかしたい
	// Transitionが完了するのを待ってからskipRenderを付与すれば解決しそうだけどパフォーマンス的な影響が不明
  content-visibility: auto;
  contain-intrinsic-size: 0 150px;
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
	padding: 24px 32px 0 calc(32px + var(--MI-avatar) + 14px);
	line-height: 28px;
	white-space: pre;
	color: var(--MI_THEME-renote);

	&::before {
		content: '';
		position: absolute;
		top: 0;
		left: calc(32px + .5 * var(--MI-avatar));
		bottom: -8px;
		border-left: var(--MI-thread-width) solid var(--MI_THEME-thread);
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
	left: calc(32px + .5 * var(--MI-avatar));
	// using solid instead of dotted, stylelistic choice
	border-left: var(--MI-thread-width) solid var(--MI_THEME-thread);
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
	border-radius: var(--MI-radius-ellipse);
	pointer-events: none;
}

.avatar {
	flex-shrink: 0;
	display: block !important;
	position: sticky !important;
	margin: 0 14px 0 0;
	width: var(--MI-avatar);
	height: var(--MI-avatar);

	&.useSticky {
		position: sticky !important;
		top: calc(22px + var(--MI-stickyTop, 0px));
		left: 0;
		transition: top 0.5s;
	}

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
	bottom: calc(var(--MI-stickyBottom, 0px) + 1em);
}

.showLessLabel {
	display: inline-block;
	background: var(--MI_THEME-popup);
	padding: 6px 15px;
	font-size: 0.8em;
	border-radius: var(--MI-radius-ellipse);
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
	//background: linear-gradient(0deg, var(--MI_THEME-panel), color(from var(--MI_THEME-panel) srgb r g b / 0));

	&:hover > .collapsedLabel {
		background: var(--MI_THEME-panelHighlight);
	}
}

.collapsedLabel {
	display: inline-block;
	background: var(--MI_THEME-panel);
	padding: 6px 10px;
	font-size: 0.8em;
	border-radius: var(--MI-radius-ellipse);
	box-shadow: 0 2px 6px rgb(0 0 0 / 20%);
}

.text {
	overflow-wrap: break-word;
}

.replyIcon {
	color: var(--MI_THEME-accent);
	margin-right: 0.5em;
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
	border: solid 1px var(--MI_THEME-renote);
	border-radius: var(--MI-radius-sm);
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

	&:hover {
		color: var(--MI_THEME-fgHighlighted);
	}
}

.footerButtonCount {
	display: inline;
	margin: 0 0 0 8px;
	opacity: 0.7;
}

@container (max-width: 580px) {
	.root {
		font-size: 0.95em;
		--MI-avatar: 46px;
	}

	.renote {
		padding: 24px 26px 0 calc(26px + var(--MI-avatar) + 14px);

		&::before {
			left: calc(26px + .5 * var(--MI-avatar));
		}
	}

	.collapsedRenoteTarget {
		padding: 8px 26px 24px;
	}

	.collapsedInReplyTo {
		padding: 28px 35px 0;
	}

	.collapsedInReplyToLine {
		left: calc(26px + .5 * var(--MI-avatar));
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
		left: calc(25px + .5 * var(--MI-avatar));
	}
}

@container (max-width: 500px) {
	.renote {
		padding: 23px 25px 0 calc(25px + var(--MI-avatar) + 14px);

		&::before {
			left: calc(25px + .5 * var(--MI-avatar));
		}
	}
}

@container (max-width: 480px) {
	.renote {
		padding: 22px 24px 0 calc(24px + var(--MI-avatar) + 14px);

		&::before {
			left: calc(24px + .5 * var(--MI-avatar));
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
		left: calc(24px + .5 * var(--MI-avatar));
		top: calc(22px + 28px); // 22px of .root padding, plus 28px of avatar height
	}

	.article {
		padding: 22px 24px;
	}
}

@container (max-width: 450px) {
	.root {
		--MI-avatar: 44px;
	}

	.avatar {
		margin: 0 10px 0 0;

		&.useSticky {
			top: calc(14px + var(--MI-stickyTop, 0px));
		}
	}
}

@container (max-width: 350px) {
	.colorBar {
		top: 6px;
		left: 6px;
		width: 4px;
		height: calc(100% - 12px);
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
	cursor: pointer;
}

.muted:hover {
	background: var(--MI_THEME-buttonBg);
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
