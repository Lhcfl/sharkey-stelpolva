/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiNote } from '@/models/Note.js';
import type { Packed } from '@/misc/json-schema.js';
import type { NoteEdit } from '@/models/NoteEdit.js';

// NoteEntityService.isPureRenote とよしなにリンク

export type Renote =
	MiNote & {
		renoteId: NonNullable<MiNote['renoteId']>
	};

export type Quote =
	Renote & ({
		text: NonNullable<MiNote['text']>
	} | {
		cw: NonNullable<MiNote['cw']>
	} | {
		replyId: NonNullable<MiNote['replyId']>
		reply: NonNullable<MiNote['reply']> // TODO this is wrong
	} | {
		hasPoll: true
	} | {
		fileIds: [string, ...string[]]
	});

export type PureRenote =
	Renote & {
		text: null,
		cw: null,
		replyId: null,
		hasPoll: false,
		fileIds: [],
	};

export function isRenote(note: MiNote): note is Renote;
export function isRenote(note: NoteEdit): note is RenoteEdit;
export function isRenote(note: MinimalNote): note is MinimalRenote;
export function isRenote(note: MiNote | NoteEdit | MinimalNote): note is Renote | RenoteEdit | MinimalRenote;
export function isRenote(note: MiNote | NoteEdit | MinimalNote): note is Renote | RenoteEdit | MinimalRenote {
	return note.renoteId != null;
}

export function isQuote(note: Renote): note is Quote;
export function isQuote(note: RenoteEdit): note is QuoteEdit;
export function isQuote(note: MinimalNote): note is MinimalQuote;
export function isQuote(note: Renote | RenoteEdit | MinimalNote): note is Quote | QuoteEdit | MinimalQuote;
export function isQuote(note: Renote | RenoteEdit | MinimalNote): note is Quote | QuoteEdit | MinimalQuote {
	// NOTE: SYNC WITH NoteCreateService.isQuote
	return note.text != null ||
		note.cw != null ||
		note.replyId != null ||
		note.hasPoll ||
		note.fileIds.length > 0;
}

export function isPureRenote(note: MiNote): note is PureRenote;
export function isPureRenote(note: NoteEdit): note is PureRenoteEdit;
export function isPureRenote(note: MinimalNote): note is MinimalPureRenote;
export function isPureRenote(note: MiNote | NoteEdit | MinimalNote): note is PureRenote | PureRenoteEdit | MinimalPureRenote;
export function isPureRenote(note: MiNote | NoteEdit | MinimalNote): note is PureRenote | PureRenoteEdit | MinimalPureRenote {
	return isRenote(note) && !isQuote(note);
}

type PackedRenote =
	Packed<'Note'> & {
		renoteId: NonNullable<Packed<'Note'>['renoteId']>
	};

type PackedQuote =
	PackedRenote & ({
		text: NonNullable<Packed<'Note'>['text']>
	} | {
		cw: NonNullable<Packed<'Note'>['cw']>
	} | {
		replyId: NonNullable<Packed<'Note'>['replyId']>
	} | {
		poll: NonNullable<Packed<'Note'>['poll']>
	} | {
		fileIds: [string, ...string[]]
	});

type PackedPureRenote = PackedRenote & {
	text: null;
	cw: null;
	replyId: null;
	reply: null;
	poll: null;
	fileIds: [];
};

export function isRenotePacked(note: Packed<'Note'>): note is PackedRenote {
	return note.renoteId != null;
}

export function isQuotePacked(note: PackedRenote): note is PackedQuote {
	return note.text != null ||
		note.cw != null ||
		note.replyId != null ||
		note.poll != null ||
		(note.fileIds != null && note.fileIds.length > 0);
}

export function isPackedPureRenote(note: Packed<'Note'>): note is PackedPureRenote {
	return isRenotePacked(note) && !isQuotePacked(note);
}

export type RenoteEdit =
	NoteEdit & {
		renoteId: NonNullable<NoteEdit['renoteId']>
	};

export type QuoteEdit =
	RenoteEdit & ({
		text: NonNullable<NoteEdit['text']>
	} | {
		cw: NonNullable<NoteEdit['cw']>
	} | {
		replyId: NonNullable<NoteEdit['replyId']>
	} | {
		hasPoll: true
	} | {
		fileIds: [string, ...string[]],
	});

export type PureRenoteEdit =
	RenoteEdit & {
		text: null,
		cw: null,
		replyId: null,
		reply: null,
		hasPoll: false,
		fileIds: [],
	};

export type MinimalNote = Pick<MiNote, 'id' | 'visibility' | 'userId' | 'replyId' | 'renoteId' | 'text' | 'cw' | 'hasPoll' | 'fileIds'>;

export type MinimalRenote = MinimalNote & {
	renoteId: string;
};

export type MinimalQuote = MinimalRenote & ({
	text: NonNullable<MinimalNote['text']>
} | {
	cw: NonNullable<MinimalNote['cw']>
} | {
	replyId: NonNullable<MinimalNote['replyId']>
} | {
	hasPoll: true
} | {
	fileIds: [string, ...string[]],
});

export type MinimalPureRenote = MinimalRenote & {
	text: null,
	cw: null,
	replyId: null,
	reply: null,
	hasPoll: false,
	fileIds: [],
};
