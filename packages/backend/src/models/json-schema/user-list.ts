/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedUserListSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
			example: 'xxxxxxxxxx',
		},
		createdAt: {
			type: 'string',
			optional: false, nullable: false,
			format: 'date-time',
		},
		createdBy: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
		},
		name: {
			type: 'string',
			optional: false, nullable: false,
		},
		userIds: {
			type: 'array',
			nullable: false, optional: false,
			items: {
				type: 'string',
				nullable: false, optional: false,
				format: 'id',
			},
		},
		isPublic: {
			type: 'boolean',
			nullable: false,
			optional: false,
		},
		isLiked: {
			type: 'boolean',
			nullable: false,
			optional: true,
		},
		likedCount: {
			type: 'number',
			nullable: false,
			optional: true,
		},
	},
} as const;
