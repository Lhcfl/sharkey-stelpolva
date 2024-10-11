<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkSpacer :contentMax="narrow ? 800 : 1100" :style="background" style="transform: none !important;">
	<div ref="rootEl" class="ftskorzw" :class="{ wide: !narrow }" style="container-type: inline-size;">
		<div class="main _gaps">
			<MkInfo v-if="user.isSuspended" :warn="true">{{ i18n.ts.userSuspended }}</MkInfo>
			<MkInfo v-if="user.isSilenced" :warn="true">{{ i18n.ts.userSilenced }}</MkInfo>

			<div class="profile _gaps">
				<MkAccountMoved v-if="user.movedTo" :movedTo="user.movedTo"/>
				<MkRemoteCaution v-if="user.host != null" :href="user.url ?? user.uri!" class="warn"/>

				<div :key="user.id" class="main _panel">
					<div class="banner-container" :style="style">
						<div ref="bannerEl" class="banner" :style="style"></div>
						<div class="fade"></div>
						<div class="title">
							<MkUserName class="name" :user="user" :nowrap="true"/>
							<div class="bottom">
								<span class="username"><MkAcct :user="user" :detail="true"/></span>
								<span v-if="user.isAdmin" :title="i18n.ts.isAdmin" style="color: var(--badge);"><i class="ti ti-shield"></i></span>
								<span v-if="user.isLocked" :title="i18n.ts.isLocked"><i class="ti ti-lock"></i></span>
								<span v-if="user.isBot" :title="i18n.ts.isBot"><i class="ti ti-robot"></i></span>
								<button v-if="$i && !isEditingMemo && !memoDraft" class="_button add-note-button" @click="showMemoTextarea">
									<i class="ti ti-edit"/> {{ i18n.ts.addMemo }}
								</button>
							</div>
						</div>
						<ul v-if="$i && $i.id != user.id" class="info-badges">
							<li v-if="user.isFollowed && user.isFollowing">{{ i18n.ts.mutuals }}</li>
							<li v-else-if="user.isFollowing">{{ i18n.ts.following }}</li>
							<li v-else-if="user.isFollowed">{{ i18n.ts.followsYou }}</li>
							<li v-if="user.isMuted">{{ i18n.ts.muted }}</li>
							<li v-if="user.isRenoteMuted">{{ i18n.ts.renoteMuted }}</li>
							<li v-if="user.isBlocking">{{ i18n.ts.blocked }}</li>
							<li v-if="user.isBlocked && $i.isModerator">{{ i18n.ts.blockingYou }}</li>
						</ul>
						<div class="actions">
							<button class="menu _button" @click="menu"><i class="ti ti-dots"></i></button>
							<MkFollowButton v-if="$i?.id != user.id" v-model:user="user" :inline="true" :transparent="false" :full="true" class="koudoku"/>
						</div>
					</div>
					<MkAvatar class="avatar" :user="user" indicator/>
					<div class="title">
						<MkUserName :user="user" :nowrap="false" class="name"/>
						<div class="bottom">
							<span class="username"><MkAcct :user="user" :detail="true"/></span>
							<span v-if="user.isAdmin" :title="i18n.ts.isAdmin" style="color: var(--badge);"><i class="ti ti-shield"></i></span>
							<span v-if="user.isLocked" :title="i18n.ts.isLocked"><i class="ti ti-lock"></i></span>
							<span v-if="user.isBot" :title="i18n.ts.isBot"><i class="ti ti-robot"></i></span>
						</div>
					</div>
					<div v-if="user.followedMessage != null" class="followedMessage">
						<div style="border: solid 1px var(--love); border-radius: 6px; background: color-mix(in srgb, var(--love), transparent 90%); padding: 6px 8px;">
							<Mfm :text="user.followedMessage" :author="user"/>
						</div>
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
						<Mfm v-if="user.description" :text="user.description" :isBlock="true" :isNote="false" :author="user"/>
						<p v-else class="empty">{{ i18n.ts.noAccountDescription }}</p>
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
								<Mfm :text="field.name" :author="user" :plain="true" :colored="false"/>
							</dt>
							<dd class="value">
								<Mfm :text="field.value" :author="user" :colored="false"/>
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
						<XFiles :key="user.id" :user="user"/>
					</MkLazy>
					<MkLazy>
						<XActivity :key="user.id" :user="user"/>
					</MkLazy>
					<MkLazy>
						<XListenBrainz v-if="user.listenbrainz && listenbrainzdata" :key="user.id" :user="user"/>
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
								<img :src="infoImageUrl" class="_ghost" aria-hidden="true" :alt="i18n.ts.noNotes"/>
								<div>{{ i18n.ts.noNotes }}</div>
							</div>
							<div v-else class="_panel">
								<MkNote v-for="note of user.pinnedNotes" :key="note.id" class="note" :class="$style.pinnedNote" :note="note" :pinned="true"/>
							</div>
						</div>
						<MkNotes v-else :class="$style.tl" :noGap="true" :pagination="AllPagination"/>
					</MkLazy>
				</MkStickyContainer>
			</div>
		</div>
		<div v-if="!narrow" class="sub _gaps" style="container-type: inline-size;">
			<XFiles :key="user.id" :user="user"/>
			<XActivity :key="user.id" :user="user"/>
			<XListenBrainz v-if="user.listenbrainz && listenbrainzdata" :key="user.id" :user="user"/>
		</div>
	</div>
	<div class="background"></div>
</MkSpacer>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, computed, onMounted, onUnmounted, nextTick, watch, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkTab from '@/components/MkTab.vue';
import MkNotes from '@/components/MkNotes.vue';
import MkFollowButton from '@/components/MkFollowButton.vue';
import MkAccountMoved from '@/components/MkAccountMoved.vue';
import MkRemoteCaution from '@/components/MkRemoteCaution.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkButton from '@/components/MkButton.vue';
import { getScrollPosition } from '@@/js/scroll.js';
import { getUserMenu } from '@/scripts/get-user-menu.js';
import number from '@/filters/number.js';
import { userPage } from '@/filters/user.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { defaultStore } from '@/store.js';
import { $i, iAmModerator } from '@/account.js';
import { dateString } from '@/filters/date.js';
import { confetti } from '@/scripts/confetti.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { isFollowingVisibleForMe, isFollowersVisibleForMe } from '@/scripts/isFfVisibleForMe.js';
import { useRouter } from '@/router/supplier.js';
import { getStaticImageUrl } from '@/scripts/media-proxy.js';
import { infoImageUrl } from '@/instance.js';

const MkNote = defineAsyncComponent(() =>
	(defaultStore.state.noteDesign === 'misskey') ? import('@/components/MkNote.vue') :
	(defaultStore.state.noteDesign === 'sharkey') ? import('@/components/SkNote.vue') :
	null
);

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
const XListenBrainz = defineAsyncComponent(() => import("./index.listenbrainz.vue"));
//const XTimeline = defineAsyncComponent(() => import('./index.timeline.vue'));

const props = withDefaults(defineProps<{
	user: Misskey.entities.UserDetailed;
	/** Test only; MkNotes currently causes problems in vitest */
	disableNotes: boolean;
}>(), {
	disableNotes: false,
});

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
const noteview = ref<string | null>(null);

const listenbrainzdata = ref(false);
if (props.user.listenbrainz) {
	(async function() {
		try {
			const response = await fetch(`https://api.listenbrainz.org/1/user/${props.user.listenbrainz}/playing-now`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
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
	if (defaultStore.state.disableShowingAnimatedImages) {
		return {
			'--backgroundImageStatic': `url('${getStaticImageUrl(props.user.backgroundUrl)}')`
		};
	} else {
		return {
			'--backgroundImageStatic': `url('${props.user.backgroundUrl}')`
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
		userId: props.user.id
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
	if (defaultStore.state.disableShowingAnimatedImages) {
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
	const banner = bannerEl.value as any;
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
	filter: var(--blur, blur(10px)) opacity(0.6);
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
				background: color-mix(in srgb, var(--panel) 65%, transparent);

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

					> .info-badges {
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
							border-radius: var(--radius-sm);
							list-style-type: none;
							margin-left: 0;
						}

						> :not(:first-child) {
							margin-left: 8px;
						}
					}

					> .actions {
						position: absolute;
						top: 12px;
						right: 12px;
						-webkit-backdrop-filter: var(--blur, blur(8px));
						backdrop-filter: var(--blur, blur(8px));
						background: rgba(0, 0, 0, 0.2);
						padding: 8px;
						border-radius: var(--radius-lg);

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
								-webkit-backdrop-filter: var(--blur, blur(8px));
								backdrop-filter: var(--blur, blur(8px));
								border-radius: var(--radius-lg);
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
					border-bottom: solid 0.5px var(--divider);

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
					font-size: 0.9em;
				}

				> .roles {
					padding: 24px 24px 0 154px;
					font-size: 0.95em;
					display: flex;
					flex-wrap: wrap;
					gap: 8px;

					> .role {
						border: solid 1px var(--color, var(--divider));
						border-radius: var(--radius-ellipse);
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
					color: var(--fg);
					border: 1px solid var(--divider);
					border-radius: var(--radius-sm);
					padding: 8px;
					line-height: 0;

					> .heading {
						text-align: left;
						color: var(--fgTransparent);
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
						color: var(--fg);
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
					border-top: solid 0.5px var(--divider);

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
					border-top: solid 0.5px var(--divider);

					> a {
						flex: 1;
						text-align: center;

						&.active {
							color: var(--accent);
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
				margin-bottom: var(--margin);
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
			margin-left: var(--margin);
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
	border-radius: var(--radius);
	overflow: clip;
	z-index: 0;
}

.tab {
	margin-bottom: calc(var(--margin) / 2);
	padding: calc(var(--margin) / 2) 0;
	background: color-mix(in srgb, var(--bg) 65%, transparent);
	backdrop-filter: var(--blur, blur(15px));
	border-radius: var(--radius-sm);

	> button {
		border-radius: var(--radius-sm);
		margin-left: 0.4rem;
		margin-right: 0.4rem;
	}
}

.verifiedLink {
	margin-left: 4px;
	color: var(--success);
}

.pinnedNote:not(:last-child) {
	border-bottom: solid 0.5px var(--divider);
}
</style>
