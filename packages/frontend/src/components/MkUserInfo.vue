<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_panel" :class="$style.root">
	<div :class="$style.banner" :style="user.bannerUrl ? { backgroundImage: `url(${prefer.s.disableShowingAnimatedImages ? getStaticImageUrl(user.bannerUrl) : user.bannerUrl})` } : ''"></div>
	<MkAvatar :class="$style.avatar" :user="user" indicator/>
	<div :class="$style.title">
		<MkA :class="$style.name" :to="userPage(user)"><MkUserName :user="user" :nowrap="false"/></MkA>
		<p :class="$style.username"><MkAcct :user="user"/></p>
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
	<div :class="$style.description">
		<div v-if="user.description" :class="$style.mfm">
			<Mfm :text="user.description" :isBlock="true" :author="user"/>
		</div>
		<span v-else style="opacity: 0.7;">{{ i18n.ts.noAccountDescription }}</span>
	</div>
	<div :class="$style.status">
		<div :class="$style.statusItem">
			<p :class="$style.statusItemLabel">{{ i18n.ts.notes }}</p><span :class="$style.statusItemValue">{{ number(user.notesCount) }}</span>
		</div>
		<div v-if="isFollowingVisibleForMe(user)" :class="$style.statusItem">
			<p :class="$style.statusItemLabel">{{ i18n.ts.following }}</p><span :class="$style.statusItemValue">{{ number(user.followingCount) }}</span>
		</div>
		<div v-if="isFollowersVisibleForMe(user)" :class="$style.statusItem">
			<p :class="$style.statusItemLabel">{{ i18n.ts.followers }}</p><span :class="$style.statusItemValue">{{ number(user.followersCount) }}</span>
		</div>
	</div>
	<MkFollowButton v-if="user.id != $i?.id" :class="$style.follow" :user="user" mini/>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import MkFollowButton from '@/components/MkFollowButton.vue';
import number from '@/filters/number.js';
import { userPage } from '@/filters/user.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { isFollowingVisibleForMe, isFollowersVisibleForMe } from '@/utility/isFfVisibleForMe.js';
import { getStaticImageUrl } from '@/utility/media-proxy.js';
import { prefer } from '@/preferences.js';

defineProps<{
	user: Misskey.entities.UserDetailed;
}>();
</script>

<style lang="scss" module>
.root {
	position: relative;
}

.banner {
	height: 84px;
	background-color: rgba(0, 0, 0, 0.1);
	background-size: cover;
	background-position: center;
}

.avatar {
	display: block;
	position: absolute;
	top: 62px;
	left: 13px;
	z-index: 2;
	width: var(--MI-avatar);
	height: var(--MI-avatar);
	border: solid 4px var(--MI_THEME-panel);
}

.title {
	display: block;
	padding: 10px 0 10px 88px;
}

.name {
	display: inline-block;
	margin: 0;
	font-weight: bold;
	line-height: 16px;
	word-break: break-all;
}

.username {
	display: block;
	margin: 0;
	line-height: 16px;
	font-size: 0.8em;
	color: var(--MI_THEME-fg);
	opacity: 0.7;
}

.followed {
	position: absolute;
	top: 12px;
	left: 12px;
	padding: 4px 8px;
	color: #fff;
	background: rgba(0, 0, 0, 0.7);
	font-size: 0.7em;
	border-radius: var(--MI-radius-sm);
}

.description {
	padding: 16px;
	font-size: 0.8em;
	border-top: solid 0.5px var(--MI_THEME-divider);
}

.mfm {
	display: -webkit-box;
	-webkit-line-clamp: 3;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.status {
	padding: 10px 16px;
	border-top: solid 0.5px var(--MI_THEME-divider);
}

.statusItem {
	display: inline-block;
	width: 33%;
}

.statusItemLabel {
	margin: 0;
	font-size: 0.7em;
	color: var(--MI_THEME-fg);
}

.statusItemValue {
	font-size: 1em;
	color: var(--MI_THEME-accent);
}

.follow {
	position: absolute !important;
	top: 8px;
	right: 8px;
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
</style>
