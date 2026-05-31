/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// AIDX
// 長さ8の[2000年1月1日からの経過ミリ秒をbase36でエンコードしたもの] + 長さ4の[個体ID] + 長さ4の[カウンタ]
// (c) mei23
// https://misskey.m544.net/notes/71899acdcc9859ec5708ac24

import { customAlphabet } from 'nanoid';
import { parseBigInt36 } from '@/misc/bigint.js';
import { IdentifiableError } from '../identifiable-error.js';

export const aidxRegExp = /^[0-9a-z]{16}$/;

// TODO potential issues with aid(x) ID system:
//   1. Predictable. Random element (NOISE) is only ~20 bits, and can be significantly reduced (down to ~6 bits) with knowledge of *any* recently-regenerated ID.
//      Because Misskey's threat model assumes that object IDs are "private" and non-predictable, this introduces a minor **security issue** for upstream.
//			Sharkey is safe because our threat model treats IDs as public, but this remains an additional risk when adopting code from Misskey.
//   2. Inefficient. Source element (NODE) provides little advantage over the random element, while also "stealing" ~20 bits which could otherwise be allocated to the random element to reduce the impact of issue #1.
//      Even in Sharkey, when predictability is not a concern, this wastes 4 **bytes** of space *for every single ID*.
//   3. Non-deterministic. Non-time elements (NOISE, NODE) can vary between identical calls to gen(), meaning that IDs cannot be reliably sorted by an ID generated at a later time.
//      The source element makes this worse, because IDs generated at the same time *but from different nodes* cannot be strictly compared with each other.

const TIME2000 = 946684800000;
const TIME_LENGTH = 8;
const NODE_LENGTH = 4;
const NOISE_LENGTH = 4;
const AIDX_LENGTH = TIME_LENGTH + NODE_LENGTH + NOISE_LENGTH;

const nodeId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', NODE_LENGTH)();
let counter = 0;

function getTime(time: number): string {
	time = time - TIME2000;
	if (time < 0) time = 0;

	return time.toString(36).padStart(TIME_LENGTH, '0').slice(-TIME_LENGTH);
}

function getNoise(): string {
	return counter.toString(36).padStart(NOISE_LENGTH, '0').slice(-NOISE_LENGTH);
}

export function genAidx(t: number): string {
	if (isNaN(t)) throw new IdentifiableError('6b73b7d5-9d2b-48b4-821c-ef955efe80ad', 'Failed to create AIDX: Invalid Date');
	counter++;
	return getTime(t) + nodeId + getNoise();
}

export function parseAidx(id: string): { date: Date; } {
	const time = parseInt(id.slice(0, TIME_LENGTH), 36) + TIME2000;
	return { date: new Date(time) };
}

export function parseAidxFull(id: string): { date: number; additional: bigint; } {
	const date = parseInt(id.slice(0, TIME_LENGTH), 36) + TIME2000;
	const additional = parseBigInt36(id.slice(TIME_LENGTH, AIDX_LENGTH));
	return { date, additional };
}

export function isSafeAidxT(t: number): boolean {
	return t > TIME2000;
}
