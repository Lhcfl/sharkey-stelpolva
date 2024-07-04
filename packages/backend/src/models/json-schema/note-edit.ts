/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedNoteEdit = {
	type: "object",
	properties: {
		id: {
			type: "string",
			optional: false,
			nullable: false,
			format: "id",
			example: "xxxxxxxxxx",
		},
		updatedAt: {
			type: "string",
			optional: false,
			nullable: false,
			format: "date-time",
		},
		note: {
			type: "object",
			optional: false,
			nullable: false,
			ref: "Note",
		},
		noteId: {
			type: "string",
			optional: false,
			nullable: false,
			format: "id",
		},
		oldText: {
			type: "string",
			optional: true,
			nullable: true,
		},
		newText: {
			type: "string",
			optional: true,
			nullable: true,
		},
		cw: {
			type: "string",
			optional: true,
			nullable: true,
		},
		fileIds: {
			type: "array",
			optional: true,
			nullable: true,
			items: {
				type: "string",
				format: "id",
			},
		},
	},
} as const;
