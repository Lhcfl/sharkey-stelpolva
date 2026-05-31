<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" :style="{ '--MI_SPACER-w': narrow ? '800px' : '1100px', ...background }">
	<div ref="rootEl" class="ftskorzw" :class="{ wide: !narrow }" style="container-type: inline-size;">
		<div class="main _gaps">
			<MkInfo v-if="user.isDeleted" :warn="true">{{ i18n.ts.userDeleted }}</MkInfo>
			<MkInfo v-if="user.isSuspended" :warn="true">{{ i18n.ts.userSuspended }}</MkInfo>
			<MkInfo v-if="user.isSilenced" :warn="true">{{ i18n.ts.userSilenced }}</MkInfo>

			<div class="profile _gaps">
				<MkAccountMoved v-if="user.movedToUri" :movedTo="user.movedTo" :movedToUri="user.movedToUri"/>
				<MkRemoteCaution v-if="user.host != null" :href="user.url ?? user.uri!"/>
				<MkInfo v-if="user.isSystem">{{ i18n.ts.isSystemAccount }}</MkInfo>

				<div :key="user.id" class="main _panel">
					<div class="banner-container" :class="{ [$style.bannerContainerTall]: useTallBanner }">
						<div ref="bannerEl" class="banner" :style="style"></div>
						<div class="fade"></div>
						<div class="title">
							<MkUserName class="name" :user="user" :nowrap="true"/>
							<div class="bottom">
								<span class="username"><MkAcct :user="user" :detail="true"/></span>
								<span v-if="user.isAdmin" :title="i18n.ts.isAdmin" style="color: var(--MI_THEME-badge);"><i class="ti ti-shield"></i></span>
								<span v-if="user.isLocked" :title="i18n.ts.isLocked"><i class="ti ti-lock"></i></span>
								<span v-if="user.isBot" :title="i18n.ts.isBot"><i class="ti ti-robot"></i></span>
								<button v-if="$i && !isEditingMemo && !memoDraft" class="_button add-note-button" @click="showMemoTextarea">
									<i class="ti ti-edit"/> {{ i18n.ts.addMemo }}
								</button>
							</div>
						</div>
						<ul v-if="$i && $i.id != user.id" :class="$style.infoBadges">
							<li v-if="user.isFollowed && user.isFollowing">{{ i18n.ts.mutuals }}</li>
							<li v-else-if="user.isFollowing">{{ i18n.ts.following }}</li>
							<li v-else-if="user.isFollowed">{{ i18n.ts.followsYou }}</li>
							<li v-if="user.isMuted">{{ i18n.ts.muted }}</li>
							<li v-if="user.isRenoteMuted">{{ i18n.ts.renoteMuted }}</li>
							<li v-if="user.isBlocking">{{ i18n.ts.blocked }}</li>
							<li v-if="user.isBlocked && $i.isModerator">{{ i18n.ts.blockingYou }}</li>
						</ul>
						<div :class="$style.actions" class="actions">
							<button :class="$style.actionsMenu" class="menu _button" @click="menu"><i class="ti ti-dots"></i></button>
							<MkFollowButton v-if="$i?.id != user.id" v-model:user="user" :class="$style.actionsFollow" :disabled="disableFollowControls" :inline="true" :transparent="false" :full="true" class="koudoku" @update:wait="onFollowButtonDisabledChanged"/>
							<div v-if="hasFollowRequest" :class="$style.actionsBanner">{{ i18n.ts.receiveFollowRequest }}</div>
							<MkButton v-if="hasFollowRequest" :class="$style.actionsAccept" :disabled="disableFollowControls" :inline="true" :transparent="false" :full="true" rounded primary @click="acceptFollowRequest"><i class="ti ti-check"/> {{ i18n.ts.accept }}</MkButton>
							<MkButton v-if="hasFollowRequest" :class="$style.actionsReject" :disabled="disableFollowControls" :inline="true" :transparent="false" :full="true" rounded danger @click="rejectFollowRequest"><i class="ti ti-x"/> {{ i18n.ts.reject }}</MkButton>
						</div>
					</div>
					<MkAvatar class="avatar" :class="{ [$style.avatarTall]: useTallBanner }" :user="user" shouldOpenLightBox indicator/>
					<div class="title">
						<MkUserName :user="user" :nowrap="false" class="name"/>
						<div class="bottom">
							<span class="username"><MkAcct :user="user" :detail="true"/></span>
							<span v-if="user.isAdmin" :title="i18n.ts.isAdmin" style="color: var(--MI_THEME-badge);"><i class="ti ti-shield"></i></span>
							<span v-if="user.isLocked" :title="i18n.ts.isLocked"><i class="ti ti-lock"></i></span>
							<span v-if="user.isBot" :title="i18n.ts.isBot"><i class="ti ti-robot"></i></span>
						</div>
					</div>
					<div v-if="user.followedMessage != null" class="followedMessage">
						<MkFukidashi class="fukidashi" :tail="narrow ? 'none' : 'left'" negativeMargin>
							<div class="messageHeader">{{ i18n.ts.messageToFollower }}</div>
							<div><MkSparkle><Mfm :plain="true" :text="user.followedMessage" :author="user" class="_selectable"/></MkSparkle></div>
						</MkFukidashi>
					</div>
					<div v-if="user.roles.length > 0" class="roles">
						<span v-for="role in user.roles" :key="role.id" v-tooltip="role.description" class="role" :style="{ '--color': role.color }">
							<MkA v-adaptive-bg :to="`/roles/${role.id}`">
								<img v-if="role.iconUrl" style="height: 1.3em; vertical-align: -22%;" :src="role.iconUrl"/>
								{{ role.name }}
							</MkA>
						</span>
					</div>
					<div v-if="iAmModerator" class="moderationNote">
						<MkTextarea v-if="editModerationNote || (moderationNote != null && moderationNote !== '')" v-model="moderationNote" manualSave>
							<template #label>{{ i18n.ts.moderationNote }}</template>
							<template #caption>{{ i18n.ts.moderationNoteDescription }}</template>
						</MkTextarea>
						<div v-else>
							<MkButton small @click="editModerationNote = true">{{ i18n.ts.addModerationNote }}</MkButton>
						</div>
					</div>
					<div v-if="isEditingMemo || memoDraft" class="memo" :class="{'no-memo': !memoDraft}">
						<div class="heading" v-text="i18n.ts.memo"/>
						<textarea
							ref="memoTextareaEl"
							v-model="memoDraft"
							rows="1"
							@focus="isEditingMemo = true"
							@blur="updateMemo"
							@input="adjustMemoTextarea"
						/>
					</div>
					<div class="description">
						<MkOmit>
							<Mfm v-if="user.description" :text="user.description" :isBlock="true" :isNote="false" :author="user" class="_selectable"/>
							<p v-else class="empty">{{ i18n.ts.noAccountDescription }}</p>
						</MkOmit>
					</div>
					<div class="fields system">
						<dl v-if="user.location" class="field">
							<dt class="name"><i class="ti ti-map-pin ti-fw"></i> {{ i18n.ts.location }}</dt>
							<dd class="value">{{ user.location }}</dd>
						</dl>
						<dl v-if="user.birthday" class="field">
							<dt class="name"><i class="ti ti-cake ti-fw"></i> {{ i18n.ts.birthday }}</dt>
							<dd class="value">{{ user.birthday.replace('-', '/').replace('-', '/') }} ({{ i18n.tsx.yearsOld({ age }) }})</dd>
						</dl>
						<dl class="field">
							<dt class="name"><i class="ti ti-calendar ti-fw"></i> {{ i18n.ts.registeredDate }}</dt>
							<dd class="value">{{ dateString(user.createdAt) }} (<MkTime :time="user.createdAt"/>)</dd>
						</dl>
					</div>
					<div v-if="user.fields.length > 0" class="fields">
						<dl v-for="(field, i) in user.fields" :key="i" class="field">
							<dt class="name">
								<Mfm :text="field.name" :author="user" :plain="true" :colored="false" class="_selectable"/>
							</dt>
							<dd class="value">
								<Mfm :text="field.value" :author="user" :colored="false" class="_selectable"/>
								<i v-if="user.verifiedLinks.includes(field.value)" v-tooltip:dialog="i18n.ts.verifiedLink" class="ti ti-circle-check" :class="$style.verifiedLink"></i>
							</dd>
						</dl>
					</div>
					<div class="status">
						<MkA :to="userPage(user)">
							<b>{{ number(user.notesCount) }}</b>
							<span>{{ i18n.ts.notes }}</span>
						</MkA>
						<MkA v-if="isFollowingVisibleForMe(user)" :to="userPage(user, 'following')">
							<b>{{ number(user.followingCount) }}</b>
							<span>{{ i18n.ts.following }}</span>
						</MkA>
						<MkA v-if="isFollowersVisibleForMe(user)" :to="userPage(user, 'followers')">
							<b>{{ number(user.followersCount) }}</b>
							<span>{{ i18n.ts.followers }}</span>
						</MkA>
					</div>
				</div>
			</div>

			<div class="contents _gaps">
				<MkInfo v-if="user.pinnedNotes.length === 0 && $i?.id === user.id">{{ i18n.ts.userPagePinTip }}</MkInfo>
				<template v-if="narrow">
					<MkLazy>
						<XFiles :key="user.id" :user="user" :collapsed="true" @unfold="emit('unfoldFiles')"/>
					</MkLazy>
					<MkLazy>
						<XActivity :key="user.id" :user="user" :collapsed="true"/>
					</MkLazy>
					<MkLazy v-if="user.listenbrainz && listenbrainzdata">
						<XListenBrainz :key="user.id" :user="user" :collapsed="true"/>
					</MkLazy>
				</template>
				<!-- <div v-if="!disableNotes">
					<MkLazy>
						<XTimeline :user="user"/>
					</MkLazy>
				</div> -->
				<MkStickyContainer>
					<template #header>
						<!-- You can't use v-if on these, as MkTab first *deletes* and replaces all children with native HTML elements. -->
						<!-- Instead, we add a "no notes" placeholder and default to null (all notes) if there's nothing pinned. -->
						<!-- It also converts all comments into text! -->
						<MkTab v-model="noteview" :class="$style.tab">
							<option value="pinned">{{ i18n.ts.pinnedOnly }}</option>
							<option :value="null">{{ i18n.ts.notes }}</option>
							<option value="all">{{ i18n.ts.all }}</option>
							<option value="files">{{ i18n.ts.withFiles }}</option>
						</MkTab>
					</template>
					<MkLazy>
						<div v-if="noteview === 'pinned'" class="_gaps">
							<div v-if="user.pinnedNotes.length < 1" class="_fullinfo">
								<MkResult type="empty" :text="i18n.ts.noNotes"/>
							</div>
							<div v-else class="_panel">
								<DynamicNote v-for="note of user.pinnedNotes" :key="note.id" class="note" :class="$style.pinnedNote" :note="note" :pinned="true" @expandMute="n => onExpandMute(n)"/>
							</div>
						</div>
						<MkNotes v-else :class="$style.tl" :noGap="true" :pagination="AllPagination" @expandMute="n => onExpandMute(n)"/>
					</MkLazy>
				</MkStickyContainer>
			</div>
		</div>
		<div v-if="!narrow" class="sub _gaps" style="container-type: inline-size;">
			<XFiles :key="user.id" :user="user" @unfold="emit('unfoldFiles')"/>
			<XActivity :key="user.id" :user="user"/>
			<XListenBrainz v-if="user.listenbrainz && listenbrainzdata" :key="user.id" :user="user"/>
		</div>
	</div>
	<div class="background"></div>
</div>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, computed, onMounted, onUnmounted, nextTick, watch, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { getScrollPosition } from '@@/js/scroll.js';
import { useMuteOverrides } from '@/utility/check-word-mute.js';
import MkTab from '@/components/MkTab.vue';
import MkNotes from '@/components/MkNotes.vue';
import MkFollowButton from '@/components/MkFollowButton.vue';
import MkAccountMoved from '@/components/MkAccountMoved.vue';
import MkFukidashi from '@/components/MkFukidashi.vue';
import MkRemoteCaution from '@/components/MkRemoteCaution.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkButton from '@/components/MkButton.vue';
import { getUserMenu } from '@/utility/get-user-menu.js';
import number from '@/filters/number.js';
import { userPage } from '@/filters/user.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { $i, iAmModerator } from '@/i.js';
import { dateString } from '@/filters/date.js';
import { confetti } from '@/utility/confetti.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { isFollowingVisibleForMe, isFollowersVisibleForMe } from '@/utility/isFfVisibleForMe.js';
import { useRouter } from '@/router.js';
import { getStaticImageUrl } from '@/utility/media-proxy.js';
import MkSparkle from '@/components/MkSparkle.vue';
import { prefer } from '@/preferences.js';
import DynamicNote from '@/components/DynamicNote.vue';
import MkOmit from '@/components/MkOmit.vue';
import { deepAssign } from '@/utility/merge';

function calcAge(birthdate: string): number {
	const date = new Date(birthdate);
	const now = new Date();

	let yearDiff = now.getFullYear() - date.getFullYear();
	const monthDiff = now.getMonth() - date.getMonth();
	const pastDate = now.getDate() < date.getDate();

	if (monthDiff < 0 || (monthDiff === 0 && pastDate)) {
		yearDiff--;
	}

	return yearDiff;
}

const XFiles = defineAsyncComponent(() => import('./index.files.vue'));
const XActivity = defineAsyncComponent(() => import('./index.activity.vue'));
const XListenBrainz = defineAsyncComponent(() => import('./index.listenbrainz.vue'));

const props = withDefaults(defineProps<{
	user: Misskey.entities.UserDetailed;
	/** Test only; MkNotes currently causes problems in vitest */
	disableNotes?: boolean;
}>(), {
	disableNotes: false,
});

const emit = defineEmits<{
	(ev: 'unfoldFiles'): void;
}>();

const muteOverrides = useMuteOverrides();

function onExpandMute(note: Misskey.entities.Note) {
	if (note.user.id === props.user.id) {
		// This kills the mandatoryCW for this user below this point
		deepAssign(muteOverrides, {
			user: {
				[props.user.id]: {
					userMandatoryCW: null,
					userSilenced: false,
				},
				instance: {
					[props.user.host ?? '']: {
						instanceMandatoryCW: null,
						instanceSilenced: false,
					},
				},
			},
		});
	}
}

const router = useRouter();

const user = ref(props.user);
const parallaxAnimationId = ref<null | number>(null);
const narrow = ref<null | boolean>(null);
const rootEl = ref<null | HTMLElement>(null);
const bannerEl = ref<null | HTMLElement>(null);
const memoTextareaEl = ref<null | HTMLElement>(null);
const memoDraft = ref(props.user.memo);
const isEditingMemo = ref(false);
const moderationNote = ref(props.user.moderationNote);
const editModerationNote = ref(false);
const noteview = ref<string | null>(props.user.pinnedNotes.length ? 'pinned' : null);

const listenbrainzdata = ref(false);
if (props.user.listenbrainz) {
	(async function() {
		try {
			const response = await window.fetch(`https://api.listenbrainz.org/1/user/${props.user.listenbrainz}/playing-now`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
				},
			});
			const data = await response.json();
			if (data.payload.listens && data.payload.listens.length !== 0) {
				listenbrainzdata.value = true;
			}
		} catch (err) {
			listenbrainzdata.value = false;
		}
	})();
}

const background = computed(() => {
	if (props.user.backgroundUrl == null) return {};
	if (prefer.s.disableShowingAnimatedImages) {
		return {
			'--backgroundImageStatic': `url('${getStaticImageUrl(props.user.backgroundUrl)}')`,
		};
	} else {
		return {
			'--backgroundImageStatic': `url('${props.user.backgroundUrl}')`,
		};
	}
});

watch(moderationNote, async () => {
	await misskeyApi('admin/update-user-note', { userId: props.user.id, text: moderationNote.value });
});

const pagination = {
	endpoint: 'users/featured-notes' as const,
	limit: 10,
	params: computed(() => ({
		userId: props.user.id,
	})),
};

const AllPagination = {
	endpoint: 'users/notes' as const,
	limit: 10,
	params: computed(() => ({
		userId: props.user.id,
		withRenotes: noteview.value === 'all',
		withReplies: noteview.value === 'all',
		withChannelNotes: noteview.value === 'all',
		withFiles: noteview.value === 'files',
	})),
};

const style = computed(() => {
	if (props.user.bannerUrl == null) return {};
	if (prefer.s.disableShowingAnimatedImages) {
		return {
			backgroundImage: `url(${ getStaticImageUrl(props.user.bannerUrl) })`,
		};
	} else {
		return {
			backgroundImage: `url(${ props.user.bannerUrl })`,
		};
	}
});

const age = computed(() => {
	return calcAge(props.user.birthday);
});

function menu(ev: MouseEvent) {
	const { menu, cleanup } = getUserMenu(user.value, router);
	os.popupMenu(menu, ev.currentTarget ?? ev.target).finally(cleanup);
}

function parallaxLoop() {
	parallaxAnimationId.value = window.requestAnimationFrame(parallaxLoop);
	parallax();
}

function parallax() {
	const banner = bannerEl.value;
	if (banner == null) return;

	const top = getScrollPosition(rootEl.value);

	if (top < 0) return;

	const z = 1.75; // 奥行き(小さいほど奥)
	const pos = -(top / z);
	banner.style.backgroundPosition = `center calc(50% - ${pos}px)`;
}

function showMemoTextarea() {
	isEditingMemo.value = true;
	nextTick(() => {
		memoTextareaEl.value?.focus();
	});
}

function adjustMemoTextarea() {
	if (!memoTextareaEl.value) return;
	memoTextareaEl.value.style.height = '0px';
	memoTextareaEl.value.style.height = `${memoTextareaEl.value.scrollHeight}px`;
}

async function updateMemo() {
	await misskeyApi('users/update-memo', {
		memo: memoDraft.value,
		userId: props.user.id,
	});
	isEditingMemo.value = false;
}

// Set true to disable the follow / follow request controls
const disableFollowControls = ref(false);
const hasFollowRequest = computed(() => user.value.hasPendingFollowRequestToYou);
const useTallBanner = computed(() => hasFollowRequest.value && narrow.value);

async function onFollowButtonDisabledChanged(disabled: boolean) {
	try {
		// Refresh the UI after MkFollowButton changes the follow relation
		if (!disabled) {
			user.value = await os.apiWithDialog('users/show', { userId: user.value.id });
		}
	} finally {
		disableFollowControls.value = disabled;
	}
}

async function acceptFollowRequest() {
	try {
		disableFollowControls.value = true;
		await os.apiWithDialog('following/requests/accept', { userId: user.value.id });
		user.value = await os.apiWithDialog('users/show', { userId: user.value.id });
	} finally {
		disableFollowControls.value = false;
	}
}

async function rejectFollowRequest() {
	try {
		disableFollowControls.value = true;
		await os.apiWithDialog('following/requests/reject', { userId: user.value.id });
		user.value = await os.apiWithDialog('users/show', { userId: user.value.id });
	} finally {
		disableFollowControls.value = false;
	}
}

watch([props.user], () => {
	memoDraft.value = props.user.memo;
});

onMounted(() => {
	window.requestAnimationFrame(parallaxLoop);
	narrow.value = rootEl.value!.clientWidth < 1000;

	if (props.user.birthday) {
		const m = new Date().getMonth() + 1;
		const d = new Date().getDate();
		const bm = parseInt(props.user.birthday.split('-')[1]);
		const bd = parseInt(props.user.birthday.split('-')[2]);
		if (m === bm && d === bd) {
			confetti({
				duration: 1000 * 4,
			});
		}
	}
	nextTick(() => {
		adjustMemoTextarea();
	});
});

onUnmounted(() => {
	if (parallaxAnimationId.value) {
		window.cancelAnimationFrame(parallaxAnimationId.value);
	}
});
</script>

<style lang="scss" scoped>
.background{
	position: fixed;
	z-index: -1;
	background: var(--backgroundImageStatic);
	background-size: cover;
	background-position: center;
	pointer-events: none;
	filter: var(--MI-blur, blur(10px)) opacity(0.6);
	// Funny CSS schenanigans to make background escape container
	left: -100%;
	top: -5%;
	right: -100%;
	bottom: -100%;
	background-attachment: fixed;
}

.ftskorzw {

	> .main {

		> .punished {
			font-size: 0.8em;
			padding: 16px;
		}

		> .profile {

			> .main {
				position: relative;
				overflow: clip;
				background: color-mix(in srgb, var(--MI_THEME-panel) 65%, transparent);

				> .banner-container {
					position: relative;
					height: 250px;
					overflow: clip;
					background-size: cover;
					background-position: center;

					> .banner {
						height: 100%;
						background-color: #4c5e6d;
						background-size: cover;
						background-position: center;
						box-shadow: 0 0 128px rgba(0, 0, 0, 0.5) inset;
						will-change: background-position;
					}

					> .fade {
						position: absolute;
						bottom: 0;
						left: 0;
						width: 100%;
						height: 78px;
						background: linear-gradient(transparent, rgba(#000, 0.7));
					}

					> .actions {
						position: absolute;
						top: 12px;
						right: 12px;
						-webkit-backdrop-filter: var(--MI-blur, blur(8px));
						backdrop-filter: var(--MI-blur, blur(8px));
						background: rgba(0, 0, 0, 0.2);
						padding: 8px;
						border-radius: var(--MI-radius-lg);

						> .menu {
							vertical-align: bottom;
							height: 31px;
							width: 31px;
							color: #fff;
							text-shadow: 0 0 8px #000;
							font-size: 16px;
						}

						> .koudoku {
							margin-left: 4px;
							vertical-align: bottom;
						}
					}

					> .title {
						position: absolute;
						bottom: 0;
						left: 0;
						width: 100%;
						padding: 0 0 8px 154px;
						box-sizing: border-box;
						color: #fff;

						> .name {
							display: block;
							margin: -10px;
							padding: 10px;
							line-height: 32px;
							font-weight: bold;
							font-size: 1.8em;
							filter: drop-shadow(0 0 4px #000);
						}

						> .bottom {
							> * {
								display: inline-block;
								margin-right: 16px;
								line-height: 20px;
								opacity: 0.8;

								&.username {
									font-weight: bold;
								}
							}

							> .add-note-button {
								background: rgba(0, 0, 0, 0.2);
								color: #fff;
								-webkit-backdrop-filter: var(--MI-blur, blur(8px));
								backdrop-filter: var(--MI-blur, blur(8px));
								border-radius: var(--MI-radius-lg);
								padding: 4px 8px;
								font-size: 80%;
							}
						}
					}
				}

				> .title {
					display: none;
					text-align: center;
					padding: 50px 8px 16px 8px;
					font-weight: bold;
					border-bottom: solid 0.5px var(--MI_THEME-divider);

					> .bottom {
						> * {
							display: inline-block;
							margin-right: 8px;
							opacity: 0.8;
						}
					}
				}

				> .avatar {
					display: block;
					position: absolute;
					top: 170px;
					left: 16px;
					z-index: 2;
					width: 120px;
					height: 120px;
					filter: drop-shadow(1px 1px 3px rgba(#000, 0.2));
				}

				> .followedMessage {
					padding: 24px 24px 0 154px;

					> .fukidashi {
						display: block;
						--fukidashi-bg: color-mix(in srgb, var(--MI_THEME-accent), var(--MI_THEME-panel) 85%);
						--fukidashi-radius: 16px;
						font-size: 0.9em;

						.messageHeader {
							opacity: 0.7;
							font-size: 0.85em;
						}
					}
				}

				> .roles {
					padding: 24px 24px 0 154px;
					font-size: 0.95em;
					display: flex;
					flex-wrap: wrap;
					gap: 8px;

					> .role {
						border: solid 1px var(--color, var(--MI_THEME-divider));
						border-radius: var(--MI-radius-ellipse);
						margin-right: 4px;
						padding: 3px 8px;
					}
				}

				> .moderationNote {
					margin: 12px 24px 0 154px;
				}

				> .memo {
					margin: 12px 24px 0 154px;
					background: transparent;
					color: var(--MI_THEME-fg);
					border: 1px solid var(--MI_THEME-divider);
					border-radius: var(--MI-radius-sm);
					padding: 8px;
					line-height: 0;

					> .heading {
						text-align: left;
						color: color(from var(--MI_THEME-fg) srgb r g b / 0.5);
						line-height: 1.5;
						font-size: 85%;
					}

					textarea {
						margin: 0;
						padding: 0;
						resize: none;
						border: none;
						outline: none;
						width: 100%;
						height: auto;
						min-height: 0;
						line-height: 1.5;
						color: var(--MI_THEME-fg);
						overflow: hidden;
						background: transparent;
						font-family: inherit;
					}
				}

				> .description {
					padding: 24px 24px 24px 154px;
					font-size: 0.95em;

					> .empty {
						margin: 0;
						opacity: 0.5;
					}
				}

				> .fields {
					padding: 24px;
					font-size: 0.9em;
					border-top: solid 0.5px var(--MI_THEME-divider);

					> .field {
						display: flex;
						padding: 0;
						margin: 0;
						align-items: center;

						&:not(:last-child) {
							margin-bottom: 8px;
						}

						> .name {
							width: 30%;
							overflow: hidden;
							white-space: nowrap;
							text-overflow: ellipsis;
							font-weight: bold;
							text-align: center;
						}

						> .value {
							width: 70%;
							overflow: hidden;
							white-space: nowrap;
							text-overflow: ellipsis;
							margin: 0;
						}
					}

					&.system > .field > .name {
					}
				}

				> .status {
					display: flex;
					padding: 24px;
					border-top: solid 0.5px var(--MI_THEME-divider);

					> a {
						flex: 1;
						text-align: center;

						&.active {
							color: var(--MI_THEME-accent);
						}

						&:hover {
							text-decoration: none;
						}

						> b {
							display: block;
							line-height: 16px;
						}

						> span {
							font-size: 70%;
						}
					}
				}
			}
		}

		> .contents {
			> .content {
				margin-bottom: var(--MI-margin);
			}
		}
	}

	&.wide {
		display: flex;
		width: 100%;

		> .main {
			width: 100%;
			min-width: 0;
		}

		> .sub {
			max-width: 350px;
			min-width: 350px;
			margin-left: var(--MI-margin);
		}
	}
}

@container (max-width: 500px) {
	.ftskorzw {
		> .main {
			> .profile > .main {
				> .banner-container {
					height: 140px;

					> .fade {
						display: none;
					}

					> .title {
						display: none;
					}
				}

				> .title {
					display: block;
				}

				> .avatar {
					top: 90px;
					left: 0;
					right: 0;
					width: 92px;
					height: 92px;
					margin: auto;
				}

				> .followedMessage {
					padding: 16px 16px 0 16px;
				}

				> .roles {
					padding: 16px 16px 0 16px;
					justify-content: center;
				}

				> .moderationNote {
					margin: 16px 16px 0 16px;
				}

				> .memo {
					margin: 16px 16px 0 16px;
				}

				> .description {
					padding: 16px;
					text-align: center;
				}

				> .fields {
					padding: 16px;
				}

				> .status {
					padding: 16px;
				}
			}

			> .contents {
				> .nav {
					font-size: 80%;
				}
			}
		}
	}
}
</style>

<style lang="scss" module>
.tl {
	background-color: rgba(0, 0, 0, 0);
	border-radius: var(--MI-radius);
	overflow: clip;
	z-index: 0;
}

.tab {
	margin-bottom: calc(5px / 2);
	padding: calc(5px / 2) 0;
	background: color-mix(in srgb, var(--MI_THEME-bg) 65%, transparent);
	backdrop-filter: var(--MI-blur, blur(15px));
	border-radius: var(--MI-radius-sm);

	> button {
		border-radius: var(--MI-radius-sm);
		margin-left: 0.4rem;
		margin-right: 0.4rem;
	}
}

.verifiedLink {
	margin-left: 4px;
	color: var(--MI_THEME-success);
}

.infoBadges {
	position: absolute;
	top: 12px;
	left: 12px;

	display: flex;
	flex-direction: row;

	padding: 0;
	margin: 0;

	> * {
		padding: 4px 8px;
		color: #fff;
		background: rgba(0, 0, 0, 0.7);
		font-size: 0.7em;
		border-radius: var(--MI-radius-sm);
		list-style-type: none;
		margin-left: 0;
	}

	> :not(:first-child) {
		margin-left: 8px;
	}
}

.actions {
	display: grid;
	grid-template-rows: min-content min-content min-content;
	grid-template-columns: min-content auto 1fr;
	grid-template-areas:
		"menu follow follow"
		"banner banner banner"
		"accept accept reject";
}

.actionsMenu {
	grid-area: menu;
	width: unset;
}

.actionsFollow {
	grid-area: follow;
	margin-left: 8px;
}

.actionsBanner {
	grid-area: banner;
	justify-self: center;
	margin-top: 8px;
	margin-bottom: 4px;
}

.actionsAccept {
	grid-area: accept;
}

.actionsReject {
	grid-area: reject;
	margin-left: 8px;
}

.bannerContainerTall {
	height: 200px !important;
}

.avatarTall {
	top: 150px !important;
}
</style>
