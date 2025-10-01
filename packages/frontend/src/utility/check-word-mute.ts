/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { checkStpvSoftMute } from './check-stpv-soft-mute';
import { provide, inject, reactive, computed, unref } from 'vue';
import type { Ref, ComputedRef, Reactive } from 'vue';
import { $i } from '@/i.js';
import { deepAssign } from '@/utility/merge';

export interface Mute {
	hasMute: boolean;

	hardMuted?: boolean;
	softMutedWords?: string[];
	sensitiveMuted?: boolean;

	userSilenced?: boolean;
	instanceSilenced?: boolean;

	threadMuted?: boolean;
	noteMuted?: boolean;

	noteMandatoryCW?: string | null;
	userMandatoryCW?: string | null;
	instanceMandatoryCW?: string | null;

	stpvMute: ReturnType<typeof checkStpvSoftMute>;
}

export interface MuteOverrides {
	/**
	 * Allows directly modifying the Mute object for all mutes.
	 */
	all?: Partial<Omit<Mute, 'hasMute'>>;

	/**
	 * Per instance overrides.
	 * Key: instance hostname.
	 */
	instance: Partial<Record<string, Partial<Mute>>>;

	/**
	 * Per user overrides.
	 * Key: user ID.
	 */
	user: Partial<Record<string, Partial<Mute>>>;

	/**
	 * Per note overrides.
	 * Key: note ID.
	 */
	note: Partial<Record<string, Partial<Mute>>>;

	/**
	 * Per thread overrides.
	 * Key: thread ID.
	 */
	thread: Partial<Record<string, Partial<Mute>>>;
}

export const muteOverridesSymbol = Symbol('muteOverrides');

export function useMuteOverrides(): Reactive<MuteOverrides> {
	// Re-use the same instance if possible
	let overrides = injectMuteOverrides();

	if (!overrides) {
		overrides = reactive({
			note: {},
			user: {},
			instance: {},
			thread: {},
		});
		provideMuteOverrides(overrides);
	}

	return overrides;
}

function injectMuteOverrides(): Reactive<MuteOverrides> | null {
	return inject(muteOverridesSymbol, null);
}

function provideMuteOverrides(overrides: Reactive<MuteOverrides> | null) {
	provide(muteOverridesSymbol, overrides);
}

export function checkMute(note: Misskey.entities.Note | ComputedRef<Misskey.entities.Note>, withHardMute?: boolean | ComputedRef<boolean>, uncollapseCW?: boolean | ComputedRef<boolean>): ComputedRef<Mute> {
	// inject() can only be used inside script setup, so it MUST be outside the computed block!
	const overrides = injectMuteOverrides();

	return computed(() => {
		const _note = unref(note);
		const _withHardMute = unref(withHardMute) ?? true;
		const _uncollapseCW = unref(uncollapseCW) ?? false;
		return getMutes(_note, _withHardMute, _uncollapseCW, overrides);
	});
}

function getMutes(note: Misskey.entities.Note, withHardMute: boolean, uncollapseCW: boolean, overrides: MuteOverrides | null): Mute {
	const override: Partial<Mute> = overrides ? deepAssign(
		{},
		note.user.host ? overrides.instance[note.user.host] : undefined,
		overrides.user[note.user.id],
		overrides.thread[note.threadId],
		overrides.note[note.id],
		overrides.all,
	) : {};

	const stpvMute = checkStpvSoftMute(note);

	const isMe = $i != null && $i.id === note.userId;
	const bypassSilence = note.bypassSilence || note.user.bypassSilence;

	const hardMuted = override.hardMuted ?? (!isMe && withHardMute && isHardMuted(note));
	const softMutedWords = override.softMutedWords ?? (isMe ? [] : isSoftMuted(note));
	const sensitiveMuted = override.sensitiveMuted ?? isSensitiveMuted(note);
	const userSilenced = override.userSilenced ?? (note.user.isSilenced && !bypassSilence);
	const instanceSilenced = override.instanceSilenced ?? (note.user.instance?.isSilenced && !bypassSilence) ?? false;
	const threadMuted = override.threadMuted ?? (!isMe && note.isMutingThread);
	const noteMuted = override.noteMuted ?? (!isMe && note.isMutingNote);
	const noteMandatoryCW = getNoteMandatoryCW(note, isMe, uncollapseCW, override);
	const userMandatoryCW = getUserMandatoryCW(note, bypassSilence, uncollapseCW, override);
	const instanceMandatoryCW = getInstanceMandatoryCW(note, bypassSilence, uncollapseCW, override);

	const hasMute = hardMuted || softMutedWords.length > 0 || sensitiveMuted || userSilenced || instanceSilenced || threadMuted || noteMuted || !!noteMandatoryCW || !!userMandatoryCW || !!instanceMandatoryCW;

	return { hasMute, hardMuted, softMutedWords, sensitiveMuted, userSilenced, instanceSilenced, threadMuted, noteMuted, noteMandatoryCW, userMandatoryCW, instanceMandatoryCW, stpvMute };
}

function getNoteMandatoryCW(note: Misskey.entities.Note, isMe: boolean, uncollapseCW: boolean, override: Partial<Mute>): string | null {
	if (override.noteMandatoryCW !== undefined) return override.noteMandatoryCW;
	if (uncollapseCW) return null;
	if (isMe) return null;
	return note.mandatoryCW ?? null;
}

function getUserMandatoryCW(note: Misskey.entities.Note, bypassSilence: boolean, uncollapseCW: boolean, override: Partial<Mute>): string | null {
	if (override.userMandatoryCW !== undefined) return override.userMandatoryCW;
	if (uncollapseCW) return null;
	if (bypassSilence) return null;
	return note.user.mandatoryCW ?? null;
}

function getInstanceMandatoryCW(note: Misskey.entities.Note, bypassSilence: boolean, uncollapseCW: boolean, override: Partial<Mute>): string | null {
	if (override.instanceMandatoryCW !== undefined) return override.instanceMandatoryCW;
	if (uncollapseCW) return null;
	if (bypassSilence) return null;
	return note.user.instance?.mandatoryCW ?? null;
}

function isHardMuted(note: Misskey.entities.Note): boolean {
	if (!$i?.hardMutedWords.length) return false;

	const inputs = expandNote(note);
	return containsMutedWord($i.hardMutedWords, inputs);
}

function isSoftMuted(note: Misskey.entities.Note): string[] {
	if (!$i?.mutedWords.length) return [];

	const inputs = expandNote(note);
	return getMutedWords($i.mutedWords, inputs);
}

function isSensitiveMuted(note: Misskey.entities.Note): boolean {
	// 1. At least one sensitive file
	if (!note.files) return false;
	if (!note.files.some((v) => v.isSensitive)) return false;

	// 2. In a timeline
	const inTimeline = inject<boolean>('inTimeline', false);
	if (!inTimeline) return false;

	// 3. With sensitive files hidden
	const tl_withSensitive = inject<Ref<boolean> | null>('tl_withSensitive', null);
	return tl_withSensitive?.value === false;
}

export function getMutedWords(mutedWords: (string | string[])[], inputs: Iterable<string>): string[] {
	// Fixup: string is assignable to Iterable<string>, but doesn't work below.
	// As a workaround, we can special-case it to "upgrade" plain strings into arrays instead.
	// We also need a noinspection tag, since JetBrains IDEs don't understand this behavior either.
	// noinspection SuspiciousTypeOfGuard
	if (typeof(inputs) === 'string') {
		inputs = [inputs];
	}

	// Parse mutes
	const { regexMutes, patternMutes } = parseMutes(mutedWords);

	// Make sure we didn't filter them all out
	if (regexMutes.length < 1 && patternMutes.length < 1) {
		return [];
	}

	const matches = new Set<string>();

	// Expand notes into searchable test
	for (const text of inputs) {
		for (const pattern of patternMutes) {
			// Case-sensitive, non-boundary search for backwards compatibility
			if (pattern.every(word => text.includes(word))) {
				const muteLabel = pattern.join(' ');
				matches.add(muteLabel);
			}
		}

		for (const regex of regexMutes) {
			for (const match of text.matchAll(regex)) {
				matches.add(match[0]);
			}
		}
	}

	return Array.from(matches);
}

export function containsMutedWord(mutedWords: (string | string[])[], inputs: Iterable<string>): boolean {
	// Parse mutes
	const { regexMutes, patternMutes } = parseMutes(mutedWords);

	// Make sure we didn't filter them all out
	if (regexMutes.length < 1 && patternMutes.length < 1) {
		return false;
	}

	// Expand notes into searchable test
	for (const text of inputs) {
		for (const pattern of patternMutes) {
			// Case-sensitive, non-boundary search for backwards compatibility
			if (pattern.every(word => text.includes(word))) {
				return true;
			}
		}

		if (regexMutes.some(regex => text.match(regex))) {
			return true;
		}
	}

	return false;
}

export function *expandNote(note: Misskey.entities.Note): Generator<string> {
	if (note.cw) yield note.cw;
	if (note.text) yield note.text;
	if (note.files) {
		for (const file of note.files) {
			if (file.comment) yield file.comment;
		}
	}
	if (note.poll) {
		for (const choice of note.poll.choices) {
			if (choice.text) yield choice.text;
		}
	}
}

function parseMutes(mutedWords: (string | string[])[]) {
	const regexMutes: RegExp[] = [];
	const patternMutes: string[][] = [];

	for (const mute of mutedWords) {
		if (Array.isArray(mute)) {
			if (mute.length > 0) {
				const filtered = mute.filter(keyword => keyword !== '');
				if (filtered.length > 0) {
					patternMutes.push(filtered);
				} else {
					console.warn('Skipping invalid pattern mute:', mute);
				}
			}
		} else {
			const parsed = mute.match(/^\/(.+)\/(.*)$/);
			if (parsed && parsed.length === 3) {
				try {
					const flags = parsed[2].includes('g') ? parsed[2] : `${parsed[2]}g`;
					regexMutes.push(new RegExp(parsed[1], flags));
				} catch {
					console.warn('Skipping invalid regexp mute:', mute);
				}
			}
		}
	}

	return { regexMutes, patternMutes };
}
