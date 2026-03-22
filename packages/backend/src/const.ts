/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';

export const USER_ONLINE_THRESHOLD = 1000 * 60 * 10; // 10min
export const USER_ACTIVE_THRESHOLD = 1000 * 60 * 60 * 24 * 3; // 3days

export const PER_NOTE_REACTION_USER_PAIR_CACHE_MAX = 16;

export const FILE_TYPE_IMAGE = [
	'image/png',
	'image/gif',
	'image/jpeg',
	'image/webp',
	'image/avif',
	'image/apng',
	'image/bmp',
	'image/tiff',
	'image/x-icon',
];

// ブラウザで直接表示することを許可するファイルの種類のリスト
// ここに含まれないものは application/octet-stream としてレスポンスされる
// SVGはXSSを生むので許可しない
export const FILE_TYPE_BROWSERSAFE = [
	// Images
	'image/png',
	'image/gif',
	'image/jpeg',
	'image/webp',
	'image/avif',
	'image/apng',
	'image/bmp',
	'image/tiff',
	'image/x-icon',

	// OggS
	'audio/opus',
	'video/ogg',
	'audio/ogg',
	'application/ogg',

	// ISO/IEC base media file format
	'video/quicktime',
	'video/mp4',
	'audio/mp4',
	'video/x-m4v',
	'audio/x-m4a',
	'video/3gpp',
	'video/3gpp2',

	'video/mpeg',
	'audio/mpeg',

	'video/webm',
	'audio/webm',

	// MKV files
	'video/x-matroska',

	'audio/aac',

	// see https://github.com/misskey-dev/misskey/pull/10686
	'audio/flac',
	'audio/wav',
	// backward compatibility
	'audio/x-flac',
	'audio/vnd.wave',
];
/*
https://github.com/sindresorhus/file-type/blob/main/supported.js
https://github.com/sindresorhus/file-type/blob/main/core.js
https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Containers
*/

export const instanceUnsignedFetchOptions = ['never', 'always', 'essential'] as const;
export type InstanceUnsignedFetchOption = (typeof instanceUnsignedFetchOptions)[number];

export const userUnsignedFetchOptions = ['never', 'always', 'essential', 'staff'] as const;
export type UserUnsignedFetchOption = (typeof userUnsignedFetchOptions)[number];

// Keep in sync with frontend consts.ts
export const permissions = [
	'read:account',
	'write:account',
	'read:blocks',
	'write:blocks',
	'read:drive',
	'write:drive',
	'read:favorites',
	'write:favorites',
	'read:following',
	'write:following',
	'read:messaging', // deprecated
	'write:messaging', // deprecated
	'read:mutes',
	'write:mutes',
	'write:notes',
	'read:notes-schedule',
	'write:notes-schedule',
	'read:notifications',
	'write:notifications',
	'read:reactions',
	'write:reactions',
	'write:votes',
	'read:pages',
	'write:pages',
	'write:page-likes',
	'read:page-likes',
	'read:user-groups',
	'write:user-groups',
	'read:channels',
	'write:channels',
	'read:gallery',
	'write:gallery',
	'read:gallery-likes',
	'write:gallery-likes',
	'read:flash',
	'write:flash',
	'read:flash-likes',
	'write:flash-likes',
	'read:admin:abuse-user-reports',
	'write:admin:delete-account',
	'write:admin:delete-all-files-of-a-user',
	'read:admin:index-stats',
	'read:admin:table-stats',
	'read:admin:user-ips',
	'read:admin:meta',
	'write:admin:reset-password',
	'write:admin:resolve-abuse-user-report',
	'read:admin:abuse-report:notification-recipient',
	'write:admin:abuse-report:notification-recipient',
	'write:admin:send-email',
	'read:admin:server-info',
	'read:admin:show-moderation-log',
	'read:admin:show-user',
	'write:admin:suspend-user',
	'write:admin:approve-user',
	'write:admin:decline-user',
	'write:admin:nsfw-user',
	'write:admin:unnsfw-user',
	'write:admin:cw-user',
	'write:admin:cw-note',
	'write:admin:cw-instance',
	'write:admin:silence-user',
	'write:admin:unsilence-user',
	'write:admin:unset-user-avatar',
	'write:admin:unset-user-banner',
	'write:admin:unsuspend-user',
	'write:admin:reject-quotes',
	'write:admin:restart-migration',
	'write:admin:meta',
	'write:admin:user-note',
	'write:admin:roles',
	'read:admin:roles',
	'write:admin:relays',
	'read:admin:relays',
	'write:admin:invite-codes',
	'read:admin:invite-codes',
	'write:admin:announcements',
	'read:admin:announcements',
	'write:admin:avatar-decorations',
	'read:admin:avatar-decorations',
	'write:admin:federation',
	'write:admin:account',
	'read:admin:account',
	'write:admin:emoji',
	'read:admin:emoji',
	'write:admin:queue',
	'read:admin:queue',
	'write:admin:promo',
	'write:admin:drive',
	'read:admin:drive',
	'write:admin:ad',
	'read:admin:ad',
	'write:invite-codes',
	'read:invite-codes',
	'write:clip-favorite',
	'read:clip-favorite',
	'read:federation',
	'write:report-abuse',
	'write:chat',
	'read:chat',
] as const;

// Keep in sync with frontend const.ts
// See: packages/backend/src/core/ReversiService.ts@L410
export const reversiUpdateKeys = [
	'map',
	'bw',
	'isLlotheo',
	'canPutEverywhere',
	'loopedBoard',
	'timeLimitForEachTurn',
] as const satisfies (keyof Misskey.entities.ReversiGameDetailed)[];
