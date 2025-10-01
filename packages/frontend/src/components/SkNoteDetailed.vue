<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only

Detailed view of a note in the Sharkey style. Used when opening a note onto its own page.
-->

<template>
<SkMutedNote
	v-show="!isDeleted"
	ref="rootComp"
	v-hotkey="keymap"
	:class="[$style.root, ...stpvNoteClassBindings(note)]"
	:note="appearNote"
	:tabindex="isDeleted ? '-1' : '0'"
	@expandMute="n => emit('expandMute', n)"
>
	<div v-if="appearNote.reply && appearNote.reply.replyId && !conversationLoaded" style="padding: 16px">
		<MkButton style="margin: 0 auto;" primary rounded @click="loadConversation">{{ i18n.ts.loadConversation }}</MkButton>
	</div>
	<div v-if="isRenote" :class="$style.renote">
		<MkAvatar :class="$style.renoteAvatar" :user="note.user" link preview/>
		<i class="ti ti-repeat" style="margin-right: 4px;"></i>
		<span :class="$style.renoteText">
			<I18n :src="i18n.ts.renotedBy" tag="span">
				<template #user>
					<MkA v-user-preview="note.userId" :class="$style.renoteName" :to="userPage(note.user)">
						<MkUserName :user="note.user"/>
					</MkA>
				</template>
			</I18n>
		</span>
		<div :class="$style.renoteInfo">
			<button ref="renoteTime" class="_button" :class="$style.renoteTime" @mousedown.prevent="showRenoteMenu()">
				<i v-if="isMyRenote" class="ti ti-dots" style="margin-right: 4px;"></i>
				<MkTime :time="note.createdAt"/>
			</button>
			<span v-if="note.visibility !== 'public'" style="margin-left: 0.5em;" :title="i18n.ts._visibility[note.visibility]">
				<i v-if="note.visibility === 'home'" class="ti ti-home"></i>
				<i v-else-if="note.visibility === 'followers'" class="ti ti-lock"></i>
				<i v-else-if="note.visibility === 'specified'" ref="specified" class="ti ti-mail"></i>
			</span>
			<span v-if="note.localOnly" style="margin-left: 0.5em;" :title="i18n.ts._visibility['disableFederation']"><i class="ti ti-rocket-off"></i></span>
		</div>
	</div>
	<template v-if="appearNote.reply && appearNote.reply.replyId">
		<SkNoteSub v-for="note in conversation" :key="note.id" :note="note" :expandAllCws="props.expandAllCws" detailed @expandMute="n => emit('expandMute', n)"/>
	</template>
	<SkNoteSub v-if="appearNote.reply" :note="appearNote.reply" :class="$style.replyTo" :expandAllCws="props.expandAllCws" detailed @expandMute="n => emit('expandMute', n)"/>
	<article :id="appearNote.id" ref="noteEl" :class="$style.note" tabindex="-1" @contextmenu.stop="onContextmenu">
		<header :class="$style.noteHeader">
			<MkAvatar :class="$style.noteHeaderAvatar" :user="appearNote.user" indicator link preview/>
			<div style="display: flex; align-items: center; white-space: nowrap; overflow: hidden;">
				<div :class="$style.noteHeaderBody">
					<div>
						<MkA v-user-preview="appearNote.user.id" :class="$style.noteHeaderName" :to="userPage(appearNote.user)">
							<MkUserName :nowrap="false" :user="appearNote.user"/>
						</MkA>
						<span v-if="appearNote.user.isBot" :class="$style.isBot">bot</span>
					</div>
					<div :class="$style.noteHeaderUsernameAndBadgeRoles">
						<div :class="$style.noteHeaderUsername">
							<MkAcct :user="appearNote.user"/>
						</div>
						<div v-if="appearNote.user.badgeRoles" :class="$style.noteHeaderBadgeRoles">
							<img v-for="(role, i) in appearNote.user.badgeRoles" :key="i" v-tooltip="role.name" :class="$style.noteHeaderBadgeRole" :src="role.iconUrl!"/>
						</div>
					</div>
				</div>
			</div>
			<div style="display: flex; align-items: flex-end; margin-left: auto;">
				<div :class="$style.noteHeaderBody">
					<div :class="$style.noteHeaderInfo">
						<span v-if="appearNote.visibility !== 'public'" style="margin-left: 0.5em;" :title="i18n.ts._visibility[appearNote.visibility]">
							<i v-if="appearNote.visibility === 'home'" class="ti ti-home"></i>
							<i v-else-if="appearNote.visibility === 'followers'" class="ti ti-lock"></i>
							<i v-else-if="appearNote.visibility === 'specified'" ref="specified" class="ti ti-mail"></i>
						</span>
						<span v-if="appearNote.updatedAt" ref="menuVersionsButton" style="margin-left: 0.5em;" title="Edited" @mousedown="menuVersions()"><i class="ph-pencil-simple ph-bold ph-lg"></i></span>
						<span v-if="appearNote.localOnly" style="margin-left: 0.5em;" :title="i18n.ts._visibility['disableFederation']"><i class="ti ti-rocket-off"></i></span>
					</div>
					<SkInstanceTicker v-if="showTicker" :host="appearNote.user.host" :instance="appearNote.user.instance"/>
				</div>
			</div>
		</header>
		<div :class="$style.noteContent">
			<p v-if="appearNote.cw != null" :class="$style.cw">
				<Mfm
					v-if="appearNote.cw != ''"
					:text="appearNote.cw"
					:author="appearNote.user"
					:nyaize="'respect'"
					:enableEmojiMenu="true"
					:enableEmojiMenuReaction="true"
					:isBlock="true"
				/>
				<MkCwButton v-model="showContent" :text="appearNote.text" :renote="appearNote.renote" :files="appearNote.files" :poll="appearNote.poll"/>
			</p>
			<div v-show="appearNote.cw == null || showContent">
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
					class="_selectable"
				/>
				<SkNoteTranslation :note="note" :translation="translation" :translating="translating"></SkNoteTranslation>
				<MkButton v-if="!allowAnim && animated" :class="$style.playMFMButton" :small="true" @click="animatedMFM()" @click.stop><i class="ph-play ph-bold ph-lg "></i> {{ i18n.ts._animatedMFM.play }}</MkButton>
				<MkButton v-else-if="!prefer.s.animatedMfm && allowAnim && animated" :class="$style.playMFMButton" :small="true" @click="animatedMFM()" @click.stop><i class="ph-stop ph-bold ph-lg "></i> {{ i18n.ts._animatedMFM.stop }}</MkButton>
				<div v-if="appearNote.files && appearNote.files.length > 0">
					<MkMediaList ref="galleryEl" :mediaList="appearNote.files"/>
				</div>
				<MkPoll v-if="appearNote.poll" ref="pollViewer" :noteId="appearNote.id" :poll="appearNote.poll" :local="!appearNote.user.host" :class="$style.poll" :author="appearNote.user" :emojiUrls="appearNote.emojis"/>
				<div v-if="isEnabledUrlPreview" class="_gaps_s" style="margin-top: 6px;" @click.stop>
					<SkUrlPreviewGroup :sourceNodes="parsed" :sourceNote="appearNote" :compact="true" :detail="true" :showAsQuote="!appearNote.user.rejectQuotes" :skipNoteIds="selfNoteIds" @expandMute="n => emit('expandMute', n)"/>
				</div>
				<div v-if="appearNote.renote" :class="$style.quote"><SkNoteSimple :note="appearNote.renote" :class="$style.quoteNote" :expandAllCws="props.expandAllCws"/></div>
			</div>
			<MkA v-if="appearNote.channel && !inChannel" :class="$style.channel" :to="`/channels/${appearNote.channel.id}`"><i class="ti ti-device-tv"></i> {{ appearNote.channel.name }}</MkA>
		</div>
		<div :class="$style.noteFooterInfo">
			<div v-if="appearNote.updatedAt">
				{{ i18n.ts.edited }}: <MkTime :time="appearNote.updatedAt" mode="detail"/>
			</div>
			<MkA :to="notePage(appearNote)">
				<MkTime :time="appearNote.createdAt" mode="detail" colored/>
			</MkA>
		</div>
		<MkReactionsViewer v-if="appearNote.reactionAcceptance !== 'likeOnly' && !stpvDisableReactions" ref="reactionsViewer" style="margin-top: 6px;" :note="appearNote"/>
		<footer :class="$style.footer" class="_gaps _h_gaps" tabindex="0" role="group" :aria-label="i18n.ts.noteFooterLabel">
			<button class="_button" :class="$style.noteFooterButton" @click="reply()">
				<i class="ti ti-arrow-back-up"></i>
				<p v-if="appearNote.repliesCount > 0" :class="$style.noteFooterButtonCount">{{ number(appearNote.repliesCount) }}</p>
			</button>
			<button
				v-if="canRenote"
				ref="renoteButton"
				v-tooltip="renoteTooltip"
				class="_button"
				:class="$style.noteFooterButton"
				:style="appearNote.isRenoted ? 'color: var(--MI_THEME-accent) !important;' : ''"
				@mousedown.prevent="appearNote.isRenoted ? undoRenote() : boostVisibility($event.shiftKey)"
			>
				<i class="ti ti-repeat"></i>
				<p v-if="appearNote.renoteCount > 0" :class="$style.noteFooterButtonCount">{{ number(appearNote.renoteCount) }}</p>
			</button>
			<button v-else class="_button" :class="$style.noteFooterButton" disabled>
				<i class="ti ti-ban"></i>
			</button>
			<button
				v-if="canRenote && !$i?.rejectQuotes"
				ref="quoteButton"
				class="_button"
				:class="$style.noteFooterButton"
				@mousedown="quote()"
			>
				<i class="ph-quotes ph-bold ph-lg"></i>
			</button>
			<button v-if="appearNote.myReaction == null && appearNote.reactionAcceptance !== 'likeOnly' && !stpvDisableReactions" ref="likeButton" :class="$style.noteFooterButton" class="_button" @mousedown="like()">
				<i class="ph-heart ph-bold ph-lg"></i>
			</button>
			<button ref="reactButton" :class="$style.noteFooterButton" class="_button" @click="toggleReact()">
				<i v-if="(appearNote.reactionAcceptance === 'likeOnly' || stpvDisableReactions) && appearNote.myReaction != null" class="ti ti-heart-filled" style="color: var(--MI_THEME-love);"></i>
				<i v-else-if="appearNote.myReaction != null" class="ti ti-minus" style="color: var(--MI_THEME-accent);"></i>
				<i v-else-if="appearNote.reactionAcceptance === 'likeOnly' || stpvDisableReactions" class="ti ti-heart"></i>
				<i v-else class="ph-smiley ph-bold ph-lg"></i>
				<p v-if="(appearNote.reactionAcceptance === 'likeOnly' || stpvDisableReactions || prefer.s.showReactionsCount) && appearNote.reactionCount > 0" :class="$style.noteFooterButtonCount">{{ number(appearNote.reactionCount) }}</p>
			</button>
			<button v-if="prefer.s.showClipButtonInNoteFooter" ref="clipButton" class="_button" :class="$style.noteFooterButton" @click.stop="clip()">
				<i class="ti ti-paperclip"></i>
			</button>
			<button v-if="prefer.s.showTranslationButtonInNoteFooter && policies.canUseTranslator && instance.translatorAvailable" ref="translationButton" class="_button" :class="$style.noteFooterButton" :disabled="translating || !!translation" @click.stop="translate()">
				<i class="ti ti-language-hiragana"></i>
			</button>
			<button ref="menuButton" class="_button" :class="$style.noteFooterButton" @click.stop="showMenu()">
				<i class="ti ti-dots"></i>
			</button>
		</footer>
	</article>
	<div :class="$style.tabs">
		<button class="_button" :class="[$style.tab, { [$style.tabActive]: tab === 'replies' }]" @click="tab = 'replies'"><i class="ti ti-arrow-back-up"></i> {{ i18n.ts.replies }}</button>
		<button class="_button" :class="[$style.tab, { [$style.tabActive]: tab === 'renotes' }]" @click="tab = 'renotes'"><i class="ti ti-repeat"></i> {{ i18n.ts.renotes }}</button>
		<button class="_button" :class="[$style.tab, { [$style.tabActive]: tab === 'quotes' }]" @click="tab = 'quotes'"><i class="ph-quotes ph-bold ph-lg"></i> {{ i18n.ts._notification._types.quote }}</button>
		<button class="_button" :class="[$style.tab, { [$style.tabActive]: tab === 'reactions' }]" @click="tab = 'reactions'"><i class="ph-smiley ph-bold ph-lg"></i> {{ i18n.ts.reactions }}</button>
	</div>
	<div>
		<div v-if="tab === 'replies'">
			<!-- <div v-if="!repliesLoaded" style="padding: 16px">
				<MkButton style="margin: 0 auto;" primary rounded @click="loadReplies">{{ i18n.ts.loadReplies }}</MkButton>
			</div> -->
			<MkPagination ref="repliesPagingComponent" :pagination="repliesPagination">
				<template #default="{ items }">
					<SkNoteSub v-for="note in items" :key="note.id" :note="note" :class="$style.reply" :detail="true" :expandAllCws="props.expandAllCws" :onDeleteCallback0="removeReply" :isReply="true" @expandMute="n => emit('expandMute', n)"/>
				</template>
			</MkPagination>
		</div>
		<div v-else-if="tab === 'renotes'" :class="$style.tab_renotes">
			<MkPagination :pagination="renotesPagination" :disableAutoLoad="true">
				<template #default="{ items }">
					<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); grid-gap: 12px;">
						<MkA v-for="item in items" :key="item.id" :to="userPage(item.user)">
							<MkUserCardMini :user="item.user" :withChart="false"/>
						</MkA>
					</div>
				</template>
			</MkPagination>
		</div>
		<div v-if="tab === 'quotes'">
			<MkPagination ref="quotesPagingComponent" :pagination="quotesPagination">
				<template #default="{ items }">
					<SkNoteSub v-for="note in items" :key="note.id" :note="note" :class="$style.reply" :detail="true" :expandAllCws="props.expandAllCws" :onDeleteCallback="removeReply" :isReply="true"/>
				</template>
			</MkPagination>
			<!-- <div v-if="!quotesLoaded" style="padding: 16px">
				<MkButton style="margin: 0 auto;" primary rounded @click="loadQuotes">{{ i18n.ts.loadReplies }}</MkButton>
			</div> -->
			<SkNoteSub v-for="note in quotes" :key="note.id" :note="note" :class="$style.reply" :detail="true" :expandAllCws="props.expandAllCws" :reply="true" @expandMute="n => emit('expandMute', n)"/>
		</div>
		<div v-else-if="tab === 'reactions'" :class="$style.tab_reactions">
			<div :class="$style.reactionTabs">
				<button v-for="reaction in Object.keys(appearNote.reactions)" :key="reaction" :class="[$style.reactionTab, { [$style.reactionTabActive]: reactionTabType === reaction }]" class="_button" @click="reactionTabType = reaction">
					<MkReactionIcon :reaction="reaction"/>
					<span style="margin-left: 4px;">{{ appearNote.reactions[reaction] }}</span>
				</button>
			</div>
			<MkPagination v-if="reactionTabType" :key="reactionTabType" :pagination="reactionsPagination" :disableAutoLoad="true">
				<template #default="{ items }">
					<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); grid-gap: 12px;">
						<MkA v-for="item in items" :key="item.id" :to="userPage(item.user)">
							<MkUserCardMini :user="item.user" :withChart="false"/>
						</MkA>
					</div>
				</template>
			</MkPagination>
		</div>
	</div>
</SkMutedNote>
</template>

<script lang="ts" setup>
import { computed, inject, onMounted, onUnmounted, onUpdated, provide, ref, useTemplateRef, watch } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { isPureRenote } from 'misskey-js/note.js';
import { isLink } from '@@/js/is-link.js';
import * as config from '@@/js/config.js';
import type { OpenOnRemoteOptions } from '@/utility/please-login.js';
import type { Paging } from '@/components/MkPagination.vue';
import type { Keymap } from '@/utility/hotkey.js';
import type { Visibility } from '@/utility/boost-quote.js';
import SkNoteSub from '@/components/SkNoteSub.vue';
import SkNoteSimple from '@/components/SkNoteSimple.vue';
import MkReactionsViewer from '@/components/MkReactionsViewer.vue';
import MkReactionsViewerDetails from '@/components/MkReactionsViewer.details.vue';
import MkMediaList from '@/components/MkMediaList.vue';
import MkCwButton from '@/components/MkCwButton.vue';
import MkPoll from '@/components/MkPoll.vue';
import MkUsersTooltip from '@/components/MkUsersTooltip.vue';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import SkInstanceTicker from '@/components/SkInstanceTicker.vue';
import { pleaseLogin } from '@/utility/please-login.js';
import { userPage } from '@/filters/user.js';
import { notePage } from '@/filters/note.js';
import number from '@/filters/number.js';
import * as os from '@/os.js';
import { misskeyApi, misskeyApiGet } from '@/utility/misskey-api.js';
import * as sound from '@/utility/sound.js';
import { reactionPicker } from '@/utility/reaction-picker.js';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { getNoteClipMenu, getNoteMenu, getRenoteMenu, translateNote } from '@/utility/get-note-menu.js';
import { getNoteVersionsMenu } from '@/utility/get-note-versions-menu.js';
import { checkAnimationFromMfm } from '@/utility/check-animated-mfm.js';
import { useNoteCapture } from '@/use/use-note-capture.js';
import { deepClone } from '@/utility/clone.js';
import { useTooltip } from '@/use/use-tooltip.js';
import { claimAchievement } from '@/utility/achievements.js';
import MkRippleEffect from '@/components/MkRippleEffect.vue';
import { showMovedDialog } from '@/utility/show-moved-dialog.js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import MkButton from '@/components/MkButton.vue';
import { boostMenuItems, computeRenoteTooltip } from '@/utility/boost-quote.js';
import { spacingNote } from '@/utility/autospacing';
import { stpvNoteClassBindings } from '@/utility/stpv-note-class-bindings';
import { instance, isEnabledUrlPreview, policies } from '@/instance.js';
import { getAppearNote } from '@/utility/get-appear-note.js';
import { prefer } from '@/preferences.js';
import { setupNoteViewInterruptors } from '@/plugin.js';
import { DI } from '@/di.js';
import { store } from '@/store';
import SkMutedNote from '@/components/SkMutedNote.vue';
import SkNoteTranslation from '@/components/SkNoteTranslation.vue';
import { getSelfNoteIds } from '@/utility/get-self-note-ids.js';
import SkUrlPreviewGroup from '@/components/SkUrlPreviewGroup.vue';
import MkNoteSub from '@/components/MkNoteSub.vue';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	initialTab?: string;
	expandAllCws?: boolean;
}>(), {
	initialTab: 'replies',
});

const emit = defineEmits<{
	(ev: 'expandMute', note: Misskey.entities.Note): void;
}>();

const inChannel = inject('inChannel', null);

const note = ref(deepClone(props.note));

// plugin
const stpvDisableReactions = store.r.stpvDisableAllReactions;

const isRenote = Misskey.note.isPureRenote(note.value);

const rootComp = useTemplateRef('rootComp');
const rootEl = computed(() => rootComp.value?.rootEl ?? null);
const noteEl = useTemplateRef('noteEl');
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
const isDeleted = ref(false);
const translation = ref<Misskey.entities.NotesTranslateResponse | false | null>(null);
const translating = ref(false);
const parsed = computed(() => appearNote.value.text ? mfm.parse(appearNote.value.text) : []);
const selfNoteIds = computed(() => getSelfNoteIds(props.note));
const animated = computed(() => parsed.value ? checkAnimationFromMfm(parsed.value) : null);
const allowAnim = ref(prefer.s.advancedMfm && prefer.s.animatedMfm ? true : false);
const showTicker = (prefer.s.instanceTicker === 'always') || (prefer.s.instanceTicker === 'remote' && appearNote.value.user.instance);
const conversation = ref<Misskey.entities.Note[]>([]);
// const replies = ref<Misskey.entities.Note[]>([]);
const quotes = ref<Misskey.entities.Note[]>([]);
const canRenote = computed(() => ['public', 'home'].includes(appearNote.value.visibility) || (appearNote.value.visibility === 'followers' && appearNote.value.userId === $i?.id));
const defaultLike = computed(() => prefer.s.like ? prefer.s.like : null);

const renoteTooltip = computeRenoteTooltip(appearNote);

setupNoteViewInterruptors(note, isDeleted);

watch(() => props.expandAllCws, (expandAllCws) => {
	if (expandAllCws !== showContent.value) showContent.value = expandAllCws;
});

let renoting = false;

const pleaseLoginContext = computed<OpenOnRemoteOptions>(() => ({
	type: 'lookup',
	url: appearNote.value.url ?? appearNote.value.uri ?? `${config.url}/notes/${appearNote.value.id}`,
}));

const keymap = {
	'r': () => reply(),
	'e|a|plus': () => react(),
	'q': () => { if (canRenote.value && !appearNote.value.isRenoted && !renoting) renote(prefer.s.visibilityOnBoost); },
	'm': () => showMenu(),
	'c': () => {
		if (!prefer.s.showClipButtonInNoteFooter) return;
		clip();
	},
	't': () => {
		if (prefer.s.showTranslationButtonInNoteFooter && policies.value.canUseTranslator && instance.translatorAvailable) {
			translate();
		}
	},
	'o': () => galleryEl.value?.openGallery(),
	'v|enter': () => {
		if (appearNote.value.cw != null) {
			showContent.value = !showContent.value;
		}
	},
	'esc': {
		allowRepeat: true,
		callback: () => blur(),
	},
} as const satisfies Keymap;

provide(DI.mfmEmojiReactCallback, (reaction) => {
	sound.playMisskeySfx('reaction');
	misskeyApi('notes/reactions/create', {
		noteId: appearNote.value.id,
		reaction: reaction,
	});
});

const tab = ref(props.initialTab);
const reactionTabType = ref<string | null>(null);

const repliesPagination = computed(() => ({
	endpoint: 'notes/children' as const,
	limit: 10,
	params: {
		noteId: appearNote.value.id,
		showQuotes: store.r.stpvCombineRepliesQuotes.value,
	},
}));
const repliesPagingComponent = useTemplateRef('repliesPagingComponent');
const quotesPagination = computed(() => ({
	endpoint: 'notes/renotes' as const,
	limit: 10,
	params: {
		noteId: appearNote.value.id,
		quote: true,
	},
}));
const quotesPagingComponent = useTemplateRef('quotesPagingComponent');
// 谁tm想出来的这么抽象的东西？
// Auto-select the first page of reactions
// watch(appearNote, n => {
// 	reactionTabType.value ??= Object.keys(n.reactions)[0] ?? null;
// }, { immediate: true });

const renotesPagination = computed<Paging>(() => ({
	endpoint: 'notes/renotes',
	limit: 10,
	params: {
		noteId: appearNote.value.id,
	},
}));

const reactionsPagination = computed<Paging>(() => ({
	endpoint: 'notes/reactions',
	limit: 10,
	params: {
		noteId: appearNote.value.id,
		type: reactionTabType.value,
	},
}));

async function addReplyTo(replyNote: Misskey.entities.Note) {
	repliesPagingComponent.value?.prepend(replyNote);
	appearNote.value.repliesCount += 1;
}

async function removeReply(id: Misskey.entities.Note['id']) {
	repliesPagingComponent.value?.removeItem(id);
	appearNote.value.repliesCount -= 1;
}

useNoteCapture({
	rootEl: rootEl,
	note: appearNote,
	pureNote: note,
	isDeletedRef: isDeleted,
	onReplyCallback: addReplyTo,
});

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

function boostVisibility(forceMenu: boolean = false) {
	if (renoting) return;

	if (!prefer.s.showVisibilitySelectorOnBoost && !forceMenu) {
		renote(prefer.s.visibilityOnBoost);
	} else {
		os.popupMenu(boostMenuItems(appearNote, renote), renoteButton.value);
	}
}

if (appearNote.value.reactionAcceptance === 'likeOnly' || stpvDisableReactions.value) {
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

function renote(visibility: Visibility, localOnly: boolean = false) {
	pleaseLogin({ openOnRemote: pleaseLoginContext.value });
	showMovedDialog();

	renoting = true;

	if (appearNote.value.channel && !appearNote.value.channel.allowRenoteToExternal) {
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
			appearNote.value.renoteCount += 1;
			appearNote.value.isRenoted = true;
		}).finally(() => { renoting = false; });
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
			localOnly: localOnly,
			visibility: visibility,
			renoteId: appearNote.value.id,
		}).then(() => {
			os.toast(i18n.ts.renoted);
			appearNote.value.isRenoted = true;
		}).finally(() => { renoting = false; });
	}
}

function quote() {
	pleaseLogin({ openOnRemote: pleaseLoginContext.value });
	showMovedDialog();

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
	showMovedDialog();
	os.post({
		reply: appearNote.value,
		channel: appearNote.value.channel,
	}).then(() => {
		focus();
	});
}

function react(): void {
	pleaseLogin({ openOnRemote: pleaseLoginContext.value });
	showMovedDialog();
	if (appearNote.value.reactionAcceptance === 'likeOnly' || stpvDisableReactions.value) {
		sound.playMisskeySfx('reaction');

		misskeyApi('notes/like', {
			noteId: appearNote.value.id,
			override: defaultLike.value,
		});
		const el = reactButton.value;
		if (el && prefer.s.animation) {
			const rect = el.getBoundingClientRect();
			const x = rect.left + (el.offsetWidth / 2);
			const y = rect.top + (el.offsetHeight / 2);
			const { dispose } = os.popup(MkRippleEffect, { x, y }, {
				end: () => dispose(),
			});
		}
	} else {
		blur();
		reactionPicker.show(reactButton.value ?? null, note.value, async (reaction) => {
			if (prefer.s.confirmOnReact) {
				const confirm = await os.confirm({
					type: 'question',
					text: i18n.tsx.reactAreYouSure({ emoji: reaction.replace('@.', '') }),
				});

				if (confirm.canceled) return;
			}

			sound.playMisskeySfx('reaction');

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

function toggleReact() {
	if (appearNote.value.myReaction == null) {
		react();
	} else {
		undoReact(appearNote.value);
	}
}

function onContextmenu(ev: MouseEvent): void {
	if (ev.target && isLink(ev.target as HTMLElement)) return;
	if (window.getSelection()?.toString() !== '') return;

	if (prefer.s.useReactionPickerForContextMenu) {
		ev.preventDefault();
		react();
	} else {
		const { menu, cleanup } = getNoteMenu({ note: note.value, translating, translation, isDeleted });
		os.contextMenu(menu, ev).then(focus).finally(cleanup);
	}
}

function showMenu(): void {
	const { menu, cleanup } = getNoteMenu({ note: note.value, translating, translation, isDeleted });
	os.popupMenu(menu, menuButton.value).then(focus).finally(cleanup);
}

async function menuVersions(): Promise<void> {
	const { menu, cleanup } = await getNoteVersionsMenu({ note: note.value });
	os.popupMenu(menu, menuVersionsButton.value).then(focus).finally(cleanup);
}

async function clip(): Promise<void> {
	os.popupMenu(await getNoteClipMenu({ note: note.value, isDeleted }), clipButton.value).then(focus);
}

async function translate() {
	await translateNote(appearNote.value.id, translation, translating);
}

function showRenoteMenu(): void {
	if (!isMyRenote) return;
	pleaseLogin({ openOnRemote: pleaseLoginContext.value });
	os.popupMenu([{
		text: i18n.ts.unrenote,
		icon: 'ti ti-trash',
		danger: true,
		action: () => {
			misskeyApi('notes/delete', {
				noteId: note.value.id,
			});
			isDeleted.value = true;
		},
	}], renoteTime.value);
}

function focus() {
	noteEl.value?.focus();
}

function blur() {
	noteEl.value?.blur();
}

// const repliesLoaded = ref(false);

// function loadReplies() {
// 	repliesLoaded.value = true;
// 	misskeyApi('notes/children', {
// 		noteId: appearNote.value.id,
// 		limit: 30,
// 		showQuotes: false,
// 	}).then(res => {
// 		replies.value = res;
// 	});
// }

// loadReplies();

// const quotesLoaded = ref(false);

// function loadQuotes() {
// 	quotesLoaded.value = true;
// 	misskeyApi('notes/renotes', {
// 		noteId: appearNote.value.id,
// 		limit: 30,
// 		quote: true,
// 	}).then(res => {
// 		quotes.value = res;
// 	});
// }

// loadQuotes();

const conversationLoaded = ref(false);

function loadConversation() {
	conversationLoaded.value = true;
	if (appearNote.value.replyId == null) return;
	misskeyApi('notes/conversation', {
		noteId: appearNote.value.replyId,
	}).then(res => {
		conversation.value = res.reverse();
		focus();
	});
}

if (appearNote.value.reply && appearNote.value.reply.replyId && prefer.s.autoloadConversation) loadConversation();

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

let isScrolling = false;

function setScrolling() {
	isScrolling = true;
}

onMounted(() => {
	window.document.addEventListener('wheel', setScrolling);
	isScrolling = false;
	noteEl.value?.scrollIntoView({ block: 'center' });
});

onUpdated(() => {
	if (!isScrolling) {
		noteEl.value?.scrollIntoView({ block: 'center' });
		if (window.location.hash) {
			window.location.replace(window.location.hash); // Jump to highlighted reply
		}
	}
});

onUnmounted(() => {
	window.document.removeEventListener('wheel', setScrolling);
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	transition: box-shadow 0.1s ease;
	overflow: clip;
	contain: content;

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
			border: dashed 2px var(--MI_THEME-focus);
			border-radius: var(--MI-radius);
			box-sizing: border-box;
		}
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

.replyTo {
	padding-bottom: 0;
}

.renote {
	display: flex;
	align-items: center;
	padding: 16px 32px 8px 32px;
	line-height: 28px;
	white-space: pre;
	color: var(--MI_THEME-renote);
}

.renoteAvatar {
	flex-shrink: 0;
	display: inline-block;
	width: 28px;
	height: 28px;
	margin: 0 8px 0 0;
	border-radius: var(--MI-radius-sm);
}

.renoteText {
	overflow: hidden;
	flex-shrink: 1;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.renoteName {
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

.renote + .note {
	padding-top: 8px;
}

.note {
	position: relative;
	padding: 32px;
	font-size: 1.2em;
	overflow: hidden;

	&:hover > .main > .footer > .button {
		opacity: 1;
	}

	&:focus-visible {
		outline: none;

		&:after {
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
			border: solid 1px var(--MI_THEME-focus);
			border-radius: var(--MI-radius);
			box-sizing: border-box;
		}
	}
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
	text-align: right;
}

.noteHeaderUsernameAndBadgeRoles {
	display: flex;
}

.noteHeaderUsername {
	margin-bottom: 2px;
	margin-right: 0.5em;
	line-height: 1.3;
	word-wrap: anywhere;
	text-overflow: ellipsis;
	white-space: nowrap;

	&::-webkit-scrollbar {
		display: none;
	}
}

.playMFMButton {
	margin-top: 5px;
}

.noteHeaderBadgeRoles {
	margin: 0 .5em 0 0;
}

.noteHeaderBadgeRole {
	height: 1.3em;
	vertical-align: -20%;

	& + .noteHeaderBadgeRole {
		margin-left: 0.2em;
	}
}

.noteContent {
	container-type: inline-size;
	overflow-wrap: break-word;
	z-index: 1;
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

.poll {
	font-size: 80%;
}

.quote {
	padding: 8px 0;
}

.quoteNote {
	padding: 16px;
	border: solid 1px var(--MI_THEME-renote);
	border-radius: var(--MI-radius-sm);
	overflow: clip;
}

.channel {
	opacity: 0.7;
	font-size: 80%;
}

.noteFooterInfo {
	margin: 16px 0;
	opacity: 0.7;
	font-size: 0.9em;
}

.noteFooterButton {
	margin: 0;
	padding: 8px;
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

.reply:not(:first-child) {
	border-top: solid 0.5px var(--MI_THEME-divider);
}

.tabs {
	border-top: solid 0.5px var(--MI_THEME-divider);
	border-bottom: solid 0.5px var(--MI_THEME-divider);
	display: flex;
}

.tab {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: 1;
	padding: 12px 8px;
	border-top: solid 2px transparent;
	border-bottom: solid 2px transparent;

	> i {
		margin-right: 8px;
	}
}

.tabActive {
	border-bottom: solid 2px var(--MI_THEME-accent);
}

.tab_renotes {
	padding: 16px;
}

.tab_reactions {
	padding: 16px;
}

.reactionTabs {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
	margin-bottom: 8px;
}

.reactionTab {
	padding: 4px 6px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius-sm);
}

.reactionTabActive {
	border-color: var(--MI_THEME-accent);
}

@container (max-width: 380px) {
	.root {
		font-size: 0.9em;
	}
}

@container (max-width: 450px) {
	.renote {
		padding: 8px 16px 0 16px;
	}

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
}

.avatar {
	flex-shrink: 0 !important;
	display: block !important;
	margin: 0 10px 0 0 !important;
	width: 40px !important;
	height: 40px !important;
	border-radius: var(--MI-radius-sm) !important;
}

// Mute CSS moved to SkMutedNote.vue

.badgeRoles {
	margin: 0 .5em 0 0;
}

.badgeRole {
	height: 1.3em;
	vertical-align: -20%;

	& + .badgeRole {
		margin-left: 0.2em;
	}
}
</style>
