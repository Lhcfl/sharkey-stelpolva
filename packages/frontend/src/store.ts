/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { markRaw, ref } from 'vue';
import * as Misskey from 'misskey-js';
import lightTheme from '@@/themes/l-light.json5';
import darkTheme from '@@/themes/d-green-lime.json5';
import { hemisphere } from '@@/js/intl-const.js';
import type { DeviceKind } from '@/utility/device-kind.js';
import type { Plugin } from '@/plugin.js';
import type { FollowingFeedState } from '@/types/following-feed.js';
import { miLocalStorage } from '@/local-storage.js';
import { Pizzax } from '@/lib/pizzax.js';
import { DEFAULT_DEVICE_KIND } from '@/utility/device-kind.js';
import { defaultFollowingFeedState } from '@/types/following-feed.js';
import { searchEngineMap } from '@/utility/search-engine-map.js';
import { stpvDefaultStoreExtension } from './stpv-store-ext';

/**
 * 「状態」を管理するストア(not「設定」)
 */
export const store = markRaw(new Pizzax('base', {
	accountSetupWizard: {
		where: 'account',
		default: 0,
	},
	timelineTutorials: {
		where: 'account',
		default: {
			home: false,
			local: false,
			social: false,
			global: false,
		},
	},
	abusesTutorial: {
		where: 'account',
		default: false,
	},
	readDriveTip: {
		where: 'account',
		default: false,
	},
	memo: {
		where: 'account',
		default: null,
	},
	reactionAcceptance: {
		where: 'account',
		default: 'nonSensitiveOnly' as 'likeOnly' | 'likeOnlyForRemote' | 'nonSensitiveOnly' | 'nonSensitiveOnlyForLocalLikeOnlyForRemote' | null,
	},
	mutedAds: {
		where: 'account',
		default: [] as string[],
	},
	visibility: {
		where: 'deviceAccount',
		default: 'public' as (typeof Misskey.noteVisibilities)[number],
	},
	localOnly: {
		where: 'deviceAccount',
		default: false,
	},
	showPreview: {
		where: 'device',
		default: false,
	},
	tl: {
		where: 'deviceAccount',
		default: {
			src: 'home' as 'home' | 'local' | 'social' | 'global' | 'bubble' | `list:${string}`,
			userList: null as Misskey.entities.UserList | null,
			filter: {
				withReplies: true,
				withRenotes: true,
				withSensitive: true,
				onlyFiles: false,
				withBots: true,
			},
		},
	},
	darkMode: {
		where: 'device',
		default: false,
	},
	recentlyUsedEmojis: {
		where: 'device',
		default: [] as string[],
	},
	recentlyUsedUsers: {
		where: 'device',
		default: [] as string[],
	},
	menuDisplay: {
		where: 'device',
		default: 'sideFull' as 'sideFull' | 'sideIcon' | 'top',
	},
	postFormWithHashtags: {
		where: 'device',
		default: false,
	},
	postFormHashtags: {
		where: 'device',
		default: '',
	},
	additionalUnicodeEmojiIndexes: {
		where: 'device',
		default: {} as Record<string, Record<string, string[]>>,
	},
	pluginTokens: {
		where: 'deviceAccount',
		default: {} as Record<string, string>, // plugin id, token
	},
	accountTokens: {
		where: 'device',
		default: {} as Record<string, string>, // host/userId, token
	},
	accountInfos: {
		where: 'device',
		default: {} as Record<string, Misskey.entities.User>, // host/userId, user
	},

	enablePreferencesAutoCloudBackup: {
		where: 'device',
		default: false,
	},
	showPreferencesAutoCloudBackupSuggestion: {
		where: 'device',
		default: true,
	},

	//#region TODO: そのうち消す (preferに移行済み)
	defaultWithReplies: {
		where: 'account',
		default: false,
	},
	reactions: {
		where: 'account',
		default: ['👍', '❤️', '😆', '🤔', '😮', '🎉', '💢', '😥', '😇', '🍮'],
	},
	pinnedEmojis: {
		where: 'account',
		default: [],
	},
	widgets: {
		where: 'account',
		default: [] as {
			name: string;
			id: string;
			place: string | null;
			data: Record<string, any>;
		}[],
	},
	overridedDeviceKind: {
		where: 'device',
		default: null as DeviceKind | null,
	},
	defaultSideView: {
		where: 'device',
		default: false,
	},
	defaultNoteVisibility: {
		where: 'account',
		default: 'public' as (typeof Misskey.noteVisibilities)[number],
	},
	defaultNoteLocalOnly: {
		where: 'account',
		default: false,
	},
	keepCw: {
		where: 'account',
		default: true,
	},
	collapseRenotes: {
		where: 'account',
		default: true,
	},
	rememberNoteVisibility: {
		where: 'account',
		default: false,
	},
	uploadFolder: {
		where: 'account',
		default: null as string | null,
	},
	keepOriginalUploading: {
		where: 'account',
		default: false,
	},
	menu: {
		where: 'deviceAccount',
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
		where: 'deviceAccount',
		default: [] as {
			name: string;
			id: string;
			type: string;
			size: 'verySmall' | 'small' | 'medium' | 'large' | 'veryLarge';
			black: boolean;
			props: Record<string, any>;
		}[],
	},
	pinnedUserLists: {
		where: 'deviceAccount',
		default: [] as Misskey.entities.UserList[],
	},
	serverDisconnectedBehavior: {
		where: 'device',
		default: 'disabled' as 'quiet' | 'dialog' | 'disabled',
	},
	nsfw: {
		where: 'device',
		default: 'respect' as 'respect' | 'force' | 'ignore',
	},
	highlightSensitiveMedia: {
		where: 'device',
		default: false,
	},
	animation: {
		where: 'device',
		default: !window.matchMedia('(prefers-reduced-motion)').matches,
	},
	animatedMfm: {
		where: 'device',
		default: !window.matchMedia('(prefers-reduced-motion)').matches,
	},
	advancedMfm: {
		where: 'device',
		default: true,
	},
	showReactionsCount: {
		where: 'device',
		default: false,
	},
	enableQuickAddMfmFunction: {
		where: 'device',
		default: false,
	},
	loadRawImages: {
		where: 'device',
		default: false,
	},
	imageNewTab: {
		where: 'device',
		default: false,
	},
	disableShowingAnimatedImages: {
		where: 'device',
		default: window.matchMedia('(prefers-reduced-motion)').matches,
	},
	emojiStyle: {
		where: 'device',
		default: 'twemoji', // twemoji / fluentEmoji / native
	},
	menuStyle: {
		where: 'device',
		default: 'auto' as 'auto' | 'popup' | 'drawer',
	},
	useBlurEffectForModal: {
		where: 'device',
		default: DEFAULT_DEVICE_KIND === 'desktop',
	},
	useBlurEffect: {
		where: 'device',
		default: DEFAULT_DEVICE_KIND === 'desktop',
	},
	showFixedPostForm: {
		where: 'device',
		default: false,
	},
	showFixedPostFormInChannel: {
		where: 'device',
		default: false,
	},
	enableInfiniteScroll: {
		where: 'device',
		default: true,
	},
	useReactionPickerForContextMenu: {
		where: 'device',
		default: false,
	},
	showGapBetweenNotesInTimeline: {
		where: 'device',
		default: false,
	},
	instanceTicker: {
		where: 'device',
		default: 'remote' as 'none' | 'remote' | 'always',
	},
	emojiPickerScale: {
		where: 'device',
		default: 2,
	},
	emojiPickerWidth: {
		where: 'device',
		default: 4,
	},
	emojiPickerHeight: {
		where: 'device',
		default: 4,
	},
	emojiPickerStyle: {
		where: 'device',
		default: 'auto' as 'auto' | 'popup' | 'drawer',
	},
	reportError: {
		where: 'device',
		default: false,
	},
	squareAvatars: {
		where: 'device',
		default: true,
	},
	showAvatarDecorations: {
		where: 'device',
		default: true,
	},
	numberOfPageCache: {
		where: 'device',
		default: 3,
	},
	showNoteActionsOnlyHover: {
		where: 'device',
		default: false,
	},
	showClipButtonInNoteFooter: {
		where: 'device',
		default: false,
	},
	reactionsDisplaySize: {
		where: 'device',
		default: 'medium' as 'small' | 'medium' | 'large',
	},
	limitWidthOfReaction: {
		where: 'device',
		default: true,
	},
	forceShowAds: {
		where: 'device',
		default: false,
	},
	aiChanMode: {
		where: 'device',
		default: false,
	},
	devMode: {
		where: 'device',
		default: false,
	},
	...stpvDefaultStoreExtension,
	mediaListWithOneImageAppearance: {
		where: 'device',
		default: 'expand' as 'expand' | '16_9' | '1_1' | '2_3',
	},
	notificationPosition: {
		where: 'device',
		default: 'rightBottom' as 'leftTop' | 'leftBottom' | 'rightTop' | 'rightBottom',
	},
	notificationStackAxis: {
		where: 'device',
		default: 'horizontal' as 'vertical' | 'horizontal',
	},
	enableCondensedLine: {
		where: 'device',
		default: true,
	},
	keepScreenOn: {
		where: 'device',
		default: false,
	},
	disableStreamingTimeline: {
		where: 'device',
		default: false,
	},
	useGroupedNotifications: {
		where: 'device',
		default: true,
	},
	dataSaver: {
		where: 'device',
		default: {
			media: false,
			avatar: false,
			urlPreview: false,
			code: false,
		} as Record<string, boolean>,
	},
	enableSeasonalScreenEffect: {
		where: 'device',
		default: false,
	},
	enableHorizontalSwipe: {
		where: 'device',
		default: true,
	},
	useNativeUIForVideoAudioPlayer: {
		where: 'device',
		default: false,
	},
	keepOriginalFilename: {
		where: 'device',
		default: true,
	},
	alwaysConfirmFollow: {
		where: 'device',
		default: true,
	},
	confirmWhenRevealingSensitiveMedia: {
		where: 'device',
		default: false,
	},
	contextMenu: {
		where: 'device',
		default: 'app' as 'app' | 'appWithShift' | 'native',
	},
	skipNoteRender: {
		where: 'device',
		default: false,
	},
	showSoftWordMutedWord: {
		where: 'device',
		default: false,
	},
	confirmOnReact: {
		where: 'device',
		default: false,
	},
	hemisphere: {
		where: 'device',
		default: hemisphere as 'N' | 'S',
	},
	sound_masterVolume: {
		where: 'device',
		default: 0.3,
	},
	sound_notUseSound: {
		where: 'device',
		default: false,
	},
	sound_useSoundOnlyWhenActive: {
		where: 'device',
		default: false,
	},
	sound_note: {
		where: 'device',
		default: { type: 'syuilo/n-aec', volume: 0 },
	},
	sound_noteMy: {
		where: 'device',
		default: { type: 'syuilo/n-cea-4va', volume: 1 },
	},
	sound_notification: {
		where: 'device',
		default: { type: 'syuilo/n-ea', volume: 1 },
	},
	sound_reaction: {
		where: 'device',
		default: { type: 'syuilo/bubble2', volume: 1 },
	},
	dropAndFusion: {
		where: 'device',
		default: {
			bgmVolume: 0.25,
			sfxVolume: 1,
		},
	},
	//#endregion

	//#region Sharkey
	autoloadConversation: {
		where: 'account',
		default: true,
	},
	clickToOpen: {
		where: 'device',
		default: true,
	},
	collapseFiles: {
		where: 'account',
		default: false,
	},
	collapseNotesRepliedTo: {
		where: 'account',
		default: false,
	},
	disableCatSpeak: {
		where: 'account',
		default: false,
	},
	enableFaviconNotificationDot: {
		where: 'device',
		default: true,
	},
	expandLongNote: {
		where: 'device',
		default: false,
	},
	followingFeed: {
		where: 'account',
		default: defaultFollowingFeedState as Partial<FollowingFeedState>,
	},
	like: {
		where: 'account',
		default: null as string | null,
	},
	noteDesign: {
		where: 'device',
		default: 'sharkey' as 'sharkey' | 'misskey',
	},
	notificationClickable: {
		where: 'device',
		default: false,
	},
	numberOfReplies: {
		where: 'device',
		default: 5,
	},
	oneko: {
		where: 'device',
		default: false,
	},
	searchEngine: {
		where: 'account',
		default: Object.keys(searchEngineMap)[0],
	},
	showTickerOnReplies: {
		where: 'device',
		default: false,
	},
	showVisibilitySelectorOnBoost: {
		where: 'account',
		default: true,
	},
	trustedDomains: {
		where: 'account',
		default: [] as string[],
	},
	uncollapseCW: {
		where: 'account',
		default: false,
	},
	visibilityOnBoost: {
		where: 'account',
		default: 'public' as 'public' | 'home' | 'followers',
	},
	warnExternalUrl: {
		where: 'account',
		default: true,
	},
	warnMissingAltText: {
		where: 'device',
		default: true,
	},
	//#endregion
}));

// TODO: 他のタブと永続化されたstateを同期

const PREFIX = 'miux:' as const;

interface Watcher {
	key: string;
	callback: (value: unknown) => void;
}

// TODO: 消す(preferに移行済みのため)
/**
 * 常にメモリにロードしておく必要がないような設定情報を保管するストレージ(非リアクティブ)
 */
export class ColdDeviceStorage {
	public static default = {
		lightTheme, // TODO: 消す(preferに移行済みのため)
		darkTheme, // TODO: 消す(preferに移行済みのため)
		syncDeviceDarkMode: true, // TODO: 消す(preferに移行済みのため)
		plugins: [] as Plugin[], // TODO: 消す(preferに移行済みのため)
	};

	public static watchers: Watcher[] = [];

	public static get<T extends keyof typeof ColdDeviceStorage.default>(key: T): typeof ColdDeviceStorage.default[T] {
		// TODO: indexedDBにする
		//       ただしその際はnullチェックではなくキー存在チェックにしないとダメ
		//       (indexedDBはnullを保存できるため、ユーザーが意図してnullを格納した可能性がある)
		const value = miLocalStorage.getItem(`${PREFIX}${key}`);
		if (value == null) {
			return ColdDeviceStorage.default[key];
		} else {
			return JSON.parse(value);
		}
	}

	public static getAll(): Partial<typeof this.default> {
		return (Object.keys(this.default) as (keyof typeof this.default)[]).reduce<Partial<typeof this.default>>((acc, key) => {
			const value = localStorage.getItem(PREFIX + key);
			if (value != null) {
				acc[key] = JSON.parse(value);
			}
			return acc;
		}, {});
	}

	public static set<T extends keyof typeof ColdDeviceStorage.default>(key: T, value: typeof ColdDeviceStorage.default[T]): void {
		// 呼び出し側のバグ等で undefined が来ることがある
		// undefined を文字列として miLocalStorage に入れると参照する際の JSON.parse でコケて不具合の元になるため無視

		if (value === undefined) {
			console.error(`attempt to store undefined value for key '${key}'`);
			return;
		}

		miLocalStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));

		for (const watcher of this.watchers) {
			if (watcher.key === key) watcher.callback(value);
		}
	}

	public static watch(key, callback) {
		this.watchers.push({ key, callback });
	}

	// TODO: VueのcustomRef使うと良い感じになるかも
	public static ref<T extends keyof typeof ColdDeviceStorage.default>(key: T) {
		const v = ColdDeviceStorage.get(key);
		const r = ref(v);
		// TODO: このままではwatcherがリークするので開放する方法を考える
		this.watch(key, v => {
			r.value = v;
		});
		return r;
	}

	/**
	 * 特定のキーの、簡易的なgetter/setterを作ります
	 * 主にvue場で設定コントロールのmodelとして使う用
	 */
	public static makeGetterSetter<K extends keyof typeof ColdDeviceStorage.default>(key: K) {
		// TODO: VueのcustomRef使うと良い感じになるかも
		const valueRef = ColdDeviceStorage.ref(key);
		return {
			get: () => {
				return valueRef.value;
			},
			set: (value: typeof ColdDeviceStorage.default[K]) => {
				const val = value;
				ColdDeviceStorage.set(key, val);
			},
		};
	}
}
