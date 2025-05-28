/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { WritableComputedRef } from 'vue';

export const followingTab = 'following' as const;
export const mutualsTab = 'mutuals' as const;
export const followersTab = 'followers' as const;
export const followingFeedTabs = [followingTab, mutualsTab, followersTab] as const;
export type FollowingFeedTab = typeof followingFeedTabs[number];

export type FollowingFeedState = {
	withNonPublic: boolean,
	withQuotes: boolean,
	withBots: boolean,
	withReplies: boolean,
	onlyFiles: boolean,
	userList: FollowingFeedTab,
	remoteWarningDismissed: boolean,
};

export type FollowingFeedModel = {
	[Key in keyof FollowingFeedState]: WritableComputedRef<FollowingFeedState[Key]>;
};

export const defaultFollowingFeedState: FollowingFeedState = {
	withNonPublic: false,
	withQuotes: false,
	withBots: true,
	withReplies: false,
	onlyFiles: false,
	userList: followingTab,
	remoteWarningDismissed: false,
};
