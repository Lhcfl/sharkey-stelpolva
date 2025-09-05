/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { hemisphere } from '@@/js/intl-const.js';
import type { Theme } from '@/theme.js';
import type { SoundType } from '@/utility/sound.js';
import type { Plugin } from '@/plugin.js';
import type { DeviceKind } from '@/utility/device-kind.js';
import type { DeckProfile } from '@/deck.js';
import type { Pref, PreferencesDefinition } from './manager.js';
import type { FollowingFeedState } from '@/types/following-feed.js';
import { DEFAULT_DEVICE_KIND } from '@/utility/device-kind.js';
import { searchEngineMap } from '@/utility/search-engine-map.js';
import { defaultFollowingFeedState } from '@/types/following-feed.js';
import { miLocalStorage } from '@/local-storage';

/** サウンド設定 */
export type SoundStore = {
	type: Exclude<SoundType, '_driveFile_'>;
	volume: number;
} | {
	type: '_driveFile_';

	/** ドライブのファイルID */
	fileId: string;

	/** ファイルURL（こちらが優先される） */
	fileUrl: string;

	volume: number;
};

// NOTE: デフォルト値は他の設定の状態に依存してはならない(依存していた場合、ユーザーがその設定項目単体で「初期値にリセット」した場合不具合の原因になる)

export const PREF_DEF = {
	accounts: {
		default: [] as [host: string, user: {
			id: string;
			username: string;
		}][],
	},

	pinnedUserLists: {
		accountDependent: true,
		default: [] as Misskey.entities.UserList[],
	},
	uploadFolder: {
		accountDependent: true,
		default: null as string | null,
	},
	widgets: {
		accountDependent: true,
		default: [{
			name: 'calendar',
			id: 'a', place: 'right', data: {},
		}, {
			name: 'notifications',
			id: 'b', place: 'right', data: {},
		}, {
			name: 'trends',
			id: 'c', place: 'right', data: {},
		}] as {
			name: string;
			id: string;
			place: string | null;
			data: Record<string, any>;
		}[],
	},
	'deck.profile': {
		accountDependent: true,
		default: null as string | null,
	},
	'deck.profiles': {
		accountDependent: true,
		default: [] as DeckProfile[],
	},

	emojiPalettes: {
		serverDependent: true,
		default: [{
			id: 'a',
			name: '',
			emojis: ['👍', '❤️', '😆', '🤔', '😮', '🎉', '💢', '😥', '😇', '🍮'],
		}] as {
			id: string;
			name: string;
			emojis: string[];
		}[],
	},
	emojiPaletteForReaction: {
		serverDependent: true,
		default: null as string | null,
	},
	emojiPaletteForMain: {
		serverDependent: true,
		default: null as string | null,
	},

	overridedDeviceKind: {
		default: null as DeviceKind | null,
	},
	themes: {
		default: [] as Theme[],
	},
	lightTheme: {
		default: null as Theme | null,
	},
	darkTheme: {
		default: null as Theme | null,
	},
	syncDeviceDarkMode: {
		default: true,
	},
	defaultNoteVisibility: {
		default: 'public' as (typeof Misskey.noteVisibilities)[number],
	},
	defaultNoteLocalOnly: {
		default: false,
	},
	keepCw: {
		default: true as boolean | 'prepend-re',
	},
	rememberNoteVisibility: {
		default: false,
	},
	reportError: {
		default: false,
	},
	collapseRenotes: {
		default: false,
	},
	menu: {
		default: [
			'notifications',
			'explore',
			'followRequests',
			'-',
			'announcements',
			'search',
			'-',
			'favorites',
			'drive',
			'achievements',
		],
	},
	statusbars: {
		default: [] as {
			name: string;
			id: string;
			type: string;
			size: 'verySmall' | 'small' | 'medium' | 'large' | 'veryLarge';
			black: boolean;
			props: Record<string, any>;
		}[],
	},
	serverDisconnectedBehavior: {
		default: 'disabled' as 'quiet' | 'disabled' | 'dialog',
	},
	nsfw: {
		default: 'respect' as 'respect' | 'force' | 'ignore',
	},
	highlightSensitiveMedia: {
		default: false,
	},
	animation: {
		default: !window.matchMedia('(prefers-reduced-motion)').matches,
	},
	animatedMfm: {
		default: !window.matchMedia('(prefers-reduced-motion)').matches,
	},
	advancedMfm: {
		default: true,
	},
	showReactionsCount: {
		default: false,
	},
	enableQuickAddMfmFunction: {
		default: false,
	},
	loadRawImages: {
		default: false,
	},
	imageNewTab: {
		default: false,
	},
	disableShowingAnimatedImages: {
		default: window.matchMedia('(prefers-reduced-motion)').matches,
	},
	emojiStyle: {
		default: 'twemoji', // twemoji / fluentEmoji / native
	},
	menuStyle: {
		default: 'auto' as 'auto' | 'popup' | 'drawer',
	},
	useBlurEffectForModal: {
		default: DEFAULT_DEVICE_KIND === 'desktop',
	},
	useBlurEffect: {
		default: DEFAULT_DEVICE_KIND === 'desktop',
	},
	useStickyIcons: {
		default: true,
	},
	showFixedPostForm: {
		default: false,
	},
	showFixedPostFormInChannel: {
		default: false,
	},
	enableInfiniteScroll: {
		default: true,
	},
	useReactionPickerForContextMenu: {
		default: false,
	},
	showGapBetweenNotesInTimeline: {
		default: false,
	},
	instanceTicker: {
		default: 'remote' as 'none' | 'remote' | 'always',
	},
	emojiPickerScale: {
		default: 2,
	},
	emojiPickerWidth: {
		default: 2,
	},
	emojiPickerHeight: {
		default: 3,
	},
	emojiPickerStyle: {
		default: 'auto' as 'auto' | 'popup' | 'drawer',
	},
	squareAvatars: {
		default: true,
	},
	showAvatarDecorations: {
		default: true,
	},
	numberOfPageCache: {
		default: 3,
	},
	showNoteActionsOnlyHover: {
		default: false,
	},
	showClipButtonInNoteFooter: {
		default: false,
	},
	showTranslationButtonInNoteFooter: {
		default: false,
	},
	reactionsDisplaySize: {
		default: 'medium' as 'small' | 'medium' | 'large',
	},
	limitWidthOfReaction: {
		default: true,
	},
	forceShowAds: {
		default: false,
	},
	aiChanMode: {
		default: false,
	},
	devMode: {
		default: false,
	},
	mediaListWithOneImageAppearance: {
		default: 'expand' as 'expand' | '16_9' | '1_1' | '2_3',
	},
	notificationPosition: {
		default: 'rightBottom' as 'leftTop' | 'leftBottom' | 'rightTop' | 'rightBottom',
	},
	notificationStackAxis: {
		default: 'horizontal' as 'vertical' | 'horizontal',
	},
	enableCondensedLine: {
		default: true,
	},
	keepScreenOn: {
		default: false,
	},
	disableStreamingTimeline: {
		default: false,
	},
	useGroupedNotifications: {
		default: true,
	},
	dataSaver: {
		default: {
			media: false,
			avatar: false,
			urlPreview: false,
			code: false,
		} as Record<string, boolean>,
	},
	hemisphere: {
		default: hemisphere as 'N' | 'S',
	},
	enableSeasonalScreenEffect: {
		default: false,
	},
	enableHorizontalSwipe: {
		default: false,
	},
	enablePullToRefresh: {
		default: true,
	},
	useNativeUiForVideoAudioPlayer: {
		default: false,
	},
	keepOriginalFilename: {
		default: true,
	},
	alwaysConfirmFollow: {
		default: true,
	},
	confirmWhenRevealingSensitiveMedia: {
		default: false,
	},
	contextMenu: {
		default: 'app' as 'app' | 'appWithShift' | 'native',
	},
	skipNoteRender: {
		default: true,
	},
	showSoftWordMutedWord: {
		default: false,
	},
	confirmOnReact: {
		default: false,
	},
	defaultFollowWithReplies: {
		default: false,
	},
	makeEveryTextElementsSelectable: {
		default: DEFAULT_DEVICE_KIND === 'desktop',
	},
	showNavbarSubButtons: {
		default: true,
	},
	showTitlebar: {
		default: false,
	},
	plugins: {
		default: [] as Plugin[],
	},

	'sound.masterVolume': {
		default: 0.3,
	},
	'sound.notUseSound': {
		default: false,
	},
	'sound.useSoundOnlyWhenActive': {
		default: false,
	},
	'sound.on.note': {
		default: { type: 'syuilo/n-aec', volume: 0 } as SoundStore,
	},
	'sound.on.noteMy': {
		default: { type: 'syuilo/n-cea-4va', volume: 1 } as SoundStore,
	},
	'sound.on.notification': {
		default: { type: 'syuilo/n-ea', volume: 1 } as SoundStore,
	},
	'sound.on.reaction': {
		default: { type: 'syuilo/bubble2', volume: 1 } as SoundStore,
	},
	'sound.on.chatMessage': {
		default: { type: 'syuilo/waon', volume: 1 } as SoundStore,
	},

	'deck.alwaysShowMainColumn': {
		default: true,
	},
	'deck.navWindow': {
		default: true,
	},
	'deck.useSimpleUiForNonRootPages': {
		default: true,
	},
	'deck.columnAlign': {
		default: 'center' as 'left' | 'right' | 'center',
	},
	'deck.columnGap': {
		default: 6,
	},
	'deck.menuPosition': {
		default: 'bottom' as 'right' | 'bottom',
	},
	'deck.navbarPosition': {
		default: 'left' as 'left' | 'top' | 'bottom',
	},
	'deck.wallpaper': {
		default: null as string | null,
	},

	'chat.showSenderName': {
		default: false,
	},
	'chat.sendOnEnter': {
		default: false,
	},

	'game.dropAndFusion': {
		default: {
			bgmVolume: 0.25,
			sfxVolume: 1,
		},
	},

	'experimental.stackingRouterView': {
		default: false,
	},

	//#region Sharkey
	autoloadConversation: {
		default: true,
	},
	clickToOpen: {
		default: true,
	},
	collapseFiles: {
		default: false,
	},
	collapseNotesRepliedTo: {
		default: false,
	},
	disableCatSpeak: {
		default: false,
	},
	enableFaviconNotificationDot: {
		default: true,
	},
	expandLongNote: {
		default: false,
	},
	followingFeed: {
		default: defaultFollowingFeedState as Partial<FollowingFeedState>,
	},
	like: {
		default: null as string | null,
	},
	noteDesign: {
		default: 'sharkey' as 'sharkey' | 'misskey',
	},
	notificationClickable: {
		default: false,
	},
	numberOfReplies: {
		default: 5,
	},
	oneko: {
		default: false,
	},
	searchEngine: {
		default: Object.keys(searchEngineMap)[0],
	},
	showTickerOnReplies: {
		default: false,
	},
	showVisibilitySelectorOnBoost: {
		default: true,
	},
	trustedDomains: {
		default: [] as string[],
	},
	uncollapseCW: {
		default: false,
	},
	visibilityOnBoost: {
		default: 'public' as 'public' | 'home' | 'followers',
	},
	warnExternalUrl: {
		default: true,
	},
	warnMissingAltText: {
		default: true,
	},
	//#endregion

	//#region hybrid options
	// These exist in preferences, but may have a legacy value in local storage.
	// Some parts of the system may still reference the legacy storage so both need to stay in sync!
	// Null means "fall back to existing value from localStorage"
	// For all of these preferences, "null" means fall back to existing value in localStorage.
	fontSize: {
		default: '0',
		needsReload: true,
		onSet: fontSize => {
			if (fontSize !== '0') {
				miLocalStorage.setItem('fontSize', fontSize);
			} else {
				miLocalStorage.removeItem('fontSize');
			}
		},
	} as Pref<'0' | '1' | '2' | '3' | 'custom'>,
	customFontSize: {
		default: 14,
		needsReload: true,
		onSet: customFontSize => {
			if (customFontSize) {
				miLocalStorage.setItem('customFontSize', customFontSize.toString());
			} else {
				miLocalStorage.removeItem('customFontSize');
			}
		},
	} as Pref<number>,
	useSystemFont: {
		default: false,
		needsReload: true,
		onSet: useSystemFont => {
			if (useSystemFont) {
				miLocalStorage.setItem('useSystemFont', 't');
			} else {
				miLocalStorage.removeItem('useSystemFont');
			}
		},
	} as Pref<boolean>,
	cornerRadius: {
		default: 'sharkey',
		needsReload: true,
		onSet: cornerRadius => {
			if (cornerRadius === 'sharkey') {
				miLocalStorage.removeItem('cornerRadius');
			} else {
				miLocalStorage.setItem('cornerRadius', cornerRadius);
			}
		},
	} as Pref<'misskey' | 'sharkey'>,
	lang: {
		default: 'en-US',
		needsReload: true,
		onSet: lang => {
			miLocalStorage.setItem('lang', lang);
			miLocalStorage.removeItem('locale');
			miLocalStorage.removeItem('localeVersion');
		},
	} as Pref<string>,
	customCss: {
		default: '',
		needsReload: true,
		onSet: customCss => {
			if (customCss) {
				miLocalStorage.setItem('customCss', customCss);
			} else {
				miLocalStorage.removeItem('customCss');
			}
		},
	} as Pref<string>,
	neverShowDonationInfo: {
		default: false,
		onSet: neverShowDonationInfo => {
			if (neverShowDonationInfo) {
				miLocalStorage.setItem('neverShowDonationInfo', 'true');
			} else {
				miLocalStorage.removeItem('neverShowDonationInfo');
			}
		},
	} as Pref<boolean>,
	neverShowLocalOnlyInfo: {
		default: false,
		onSet: neverShowLocalOnlyInfo => {
			if (neverShowLocalOnlyInfo) {
				miLocalStorage.setItem('neverShowLocalOnlyInfo', 'true');
			} else {
				miLocalStorage.removeItem('neverShowLocalOnlyInfo');
			}
		},
	} as Pref<boolean>,
	//#endregion
} satisfies PreferencesDefinition;
