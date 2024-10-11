import * as misskey from 'misskey-js';
import { defaultStore } from '@/store.js';

const NO_SPACEING_LIST = [
	'X光',
	'卡拉OK',
	'UP主',
	'IP',
	'A股',
	'AA制',
	'B股',
	'B超',
	'IP卡',
	'O型',
	'T型',
	'T恤',
	'阿Q',
	'维生素',
	'PH值',
	'SIM卡',
	'B站',
	'A站',
];

const LIST_WINDOW =
	NO_SPACEING_LIST.reduce((a, b) => Math.max(a, b.length), 0) + 1;

const CJK_REGEXP = '[\\u4e00-\\u9fa5\\u0800-\\u4e00\\uac00-\\ud7ff]';

export function autoSpacing(plainText: string) {
	if (defaultStore.reactiveState.chineseAutospacing.value == null) return plainText;
	const rep = (matched: string, c1: string, c2: string, position: number) => {
		if (defaultStore.reactiveState.chineseAutospacing.value === 'all') return `${c1} ${c2}`;
		const context = plainText
			.slice(Math.max(0, position - LIST_WINDOW), position + LIST_WINDOW)
			.toUpperCase();
		if (NO_SPACEING_LIST.some((text) => context.includes(text))) {
			return matched;
		} else {
			return `${c1} ${c2}`;
		}
	};
	return plainText
		.replace(new RegExp(`(${CJK_REGEXP})\\(([^)]+)\\)(${CJK_REGEXP})?`, 'g'), (_, c1, c2, c3) => c3 ? `${c1} (${c2}) ${c3}` : `${c1} (${c2})`)
		.replace(new RegExp(`(${CJK_REGEXP})([a-zA-Z0-9])`, 'g'), rep)
		.replace(new RegExp(`([a-zA-Z0-9,\\.:%])(${CJK_REGEXP})`, 'g'), rep);
}

export function spacingNote(note: misskey.entities.Note) {
	const noteAsRecord = note as unknown as Record<string, string | null | undefined>;
	if (!noteAsRecord.__autospacing_raw_text) {
		noteAsRecord.__autospacing_raw_text = note.text;
	}
	if (!noteAsRecord.__autospacing_raw_cw) {
		noteAsRecord.__autospacing_raw_cw = note.cw;
	}
	note.text = noteAsRecord.__autospacing_raw_text
		? autoSpacing(noteAsRecord.__autospacing_raw_text)
		: null;
	note.cw = noteAsRecord.__autospacing_raw_cw
		? autoSpacing(noteAsRecord.__autospacing_raw_cw)
		: null;
	return note;
}
