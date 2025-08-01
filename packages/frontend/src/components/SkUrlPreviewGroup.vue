<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

Displays a group of URL previews.

If the URL to be previewed links to a note, it will be displayed as a quote.
Attempts to avoid displaying the same preview twice, even if multiple URLs point to the same resource.
-->

<template>
<div v-if="isRefreshing">
	<MkLoading :class="$style.loading"></MkLoading>
</div>
<template v-else>
	<MkUrlPreview
		v-for="preview of urlPreviews"
		:key="preview.url"
		:url="preview.url"
		:previewHint="preview"
		:noteHint="preview.note"
		:attributionHint="preview.attributionUser"
		:detail="detail"
		:compact="compact"
		:showAsQuote="showAsQuote"
		:showActions="showActions"
		:skipNoteIds="skipNoteIds"
	></MkUrlPreview>
</template>
</template>

<script setup lang="ts">
import * as Misskey from 'misskey-js';
import * as mfm from 'mfm-js';
import { computed, ref, watch } from 'vue';
import { versatileLang } from '@@/js/intl-const';
import promiseLimit from 'promise-limit';
import type { SummalyResult } from '@/components/MkUrlPreview.vue';
import { extractPreviewUrls } from '@/utility/extract-preview-urls';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm';
import { $i } from '@/i';
import { misskeyApi } from '@/utility/misskey-api';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import { getNoteUrls } from '@/utility/getNoteUrls';

type Summary = SummalyResult & {
	note?: Misskey.entities.Note | null;
	attributionUser?: Misskey.entities.User | null;
};

type Limiter<T> = ReturnType<typeof promiseLimit<T>>;

const props = withDefaults(defineProps<{
	sourceUrls?: string[];
	sourceNodes?: mfm.MfmNode[];
	sourceText?: string;
	sourceNote?: Misskey.entities.Note;

	detail?: boolean;
	compact?: boolean;
	showAsQuote?: boolean;
	showActions?: boolean;
	skipNoteIds?: string[];
}>(), {
	sourceUrls: undefined,
	sourceText: undefined,
	sourceNodes: undefined,
	sourceNote: undefined,

	detail: undefined,
	compact: undefined,
	showAsQuote: undefined,
	showActions: undefined,
	skipNoteIds: () => [],
});

const urlPreviews = ref<Summary[]>([]);

const urls = computed<string[]>(() => {
	if (props.sourceUrls) {
		return props.sourceUrls;
	}

	// sourceNodes > sourceText > sourceNote
	const source =
		props.sourceNodes ??
		(props.sourceText ? mfm.parse(props.sourceText) : null) ??
		(props.sourceNote?.text ? mfm.parse(props.sourceNote.text) : null);

	if (source) {
		if (props.sourceNote) {
			return extractPreviewUrls(props.sourceNote, source);
		} else {
			return extractUrlFromMfm(source);
		}
	}

	return [];
});

const isRefreshing = ref<Promise<void> | false>(false);
const cachedNotes = new Map<string, Misskey.entities.Note | null>();
const cachedPreviews = new Map<string, Summary | null>();
const cachedUsers = new Map<string, Misskey.entities.User | null>();

/**
 * Refreshes the group.
 * Calls are automatically de-duplicated.
 */
function refresh(): Promise<void> {
	if (isRefreshing.value) return isRefreshing.value;

	const promise = doRefresh();
	promise.finally(() => isRefreshing.value = false);
	isRefreshing.value = promise;
	return promise;
}

/**
 * Refreshes the group.
 * Don't call this directly - use refresh() instead!
 */
async function doRefresh(): Promise<void> {
	let previews = await fetchPreviews();

	// Remove duplicates
	previews = deduplicatePreviews(previews);

	// Remove any with hidden notes
	previews = previews.filter(preview => !preview.note || !props.skipNoteIds.includes(preview.note.id));

	urlPreviews.value = previews;
}

async function fetchPreviews(): Promise<Summary[]> {
	const userLimiter = promiseLimit<Misskey.entities.User | null>(4);
	const noteLimiter = promiseLimit<Misskey.entities.Note | null>(2);
	const summaryLimiter = promiseLimit<Summary | null>(5);

	const summaries = await Promise.all(urls.value.map(url =>
		summaryLimiter(async () => {
			return await fetchPreview(url);
		}).then(async (summary) => {
			if (summary) {
				await Promise.all([
					attachNote(summary, noteLimiter),
					attachAttribution(summary, userLimiter),
				]);
			}

			return summary;
		})));

	return summaries.filter((preview): preview is Summary => preview != null);
}

async function fetchPreview(url: string): Promise<Summary | null> {
	const cached = cachedPreviews.get(url);
	if (cached) {
		return cached;
	}

	const headers = $i ? { Authorization: `Bearer ${$i.token}` } : undefined;
	const params = new URLSearchParams({ url, lang: versatileLang });
	const res = await window.fetch(`/url?${params.toString()}`, { headers }).catch(() => null);

	if (res?.ok) {
		// Success - got the summary
		const summary: Summary = await res.json();
		cachedPreviews.set(url, summary);
		if (summary.url !== url) {
			cachedPreviews.set(summary.url, summary);
		}
		return summary;
	}

	// Failed, blocked, or not found
	cachedPreviews.set(url, null);
	return null;
}

async function attachNote(summary: Summary, noteLimiter: Limiter<Misskey.entities.Note | null>): Promise<void> {
	if (props.showAsQuote && summary.activityPub && summary.haveNoteLocally) {
		// Have to pull this out to make TS happy
		const noteUri = summary.activityPub;

		summary.note = await noteLimiter(async () => {
			return await fetchNote(noteUri);
		});
	}
}

async function fetchNote(noteUri: string): Promise<Misskey.entities.Note | null> {
	const cached = cachedNotes.get(noteUri);
	if (cached) {
		return cached;
	}

	const response = await misskeyApi('ap/show', { uri: noteUri }).catch(() => null);
	if (response && response.type === 'Note') {
		const note = response['object'];

		// Success - got the note
		cachedNotes.set(noteUri, note);
		if (note.uri && note.uri !== noteUri) {
			cachedNotes.set(note.uri, note);
		}
		return note;
	}

	// Failed, blocked, or not found
	cachedNotes.set(noteUri, null);
	return null;
}

async function attachAttribution(summary: Summary, userLimiter: Limiter<Misskey.entities.User | null>): Promise<void> {
	if (summary.linkAttribution) {
		// Have to pull this out to make TS happy
		const userId = summary.linkAttribution.userId;

		summary.attributionUser = await userLimiter(async () => {
			return await fetchUser(userId);
		});
	}
}

async function fetchUser(userId: string): Promise<Misskey.entities.User | null> {
	const cached = cachedUsers.get(userId);
	if (cached) {
		return cached;
	}

	const user = await misskeyApi('users/show', { userId }).catch(() => null);

	cachedUsers.set(userId, user);
	return user;
}

function deduplicatePreviews(previews: Summary[]): Summary[] {
	// eslint-disable-next-line no-param-reassign
	previews = previews
		// Remove any previews with duplicate URL
		.filter((preview, index) => !previews.some((p, i) => {
			// Skip the current preview (don't count self as duplicate).
			if (p === preview) return false;

			// Skip differing URLs (not duplicate).
			if (p.url !== preview.url) return false;

			// Skip if we have AP and the other doesn't
			if (preview.activityPub && !p.activityPub) return false;

			// Skip if we have a note and the other doesn't
			if (preview.note && !p.note) return false;

			// Skip later previews (keep the earliest instance)...
			// ...but only if we have AP or the later one doesn't...
			// ...and only if we have note or the later one doesn't.
			if (i > index && (preview.activityPub || !p.activityPub) && (preview.note || !p.note)) return false;

			// If we get here, then "preview" is a duplicate of "p" and should be skipped.
			return true;
		}));

	// eslint-disable-next-line no-param-reassign
	previews = previews
		// Remove any previews with duplicate AP
		.filter((preview, index) => !previews.some((p, i) => {
			// Skip the current preview (don't count self as duplicate).
			if (p === preview) return false;

			// Skip if we don't have AP
			if (!preview.activityPub) return false;

			// Skip if other does not have AP
			if (!p.activityPub) return false;

			// Skip differing URLs (not duplicate).
			if (p.activityPub !== preview.activityPub) return false;

			// Skip later previews (keep the earliest instance)
			if (i > index) return false;

			// If we get here, then "preview" is a duplicate of "p" and should be skipped.
			return true;
		}));

	// eslint-disable-next-line no-param-reassign
	previews = previews
		// Remove any previews with duplicate note
		.filter((preview, index) => !previews.some((p, i) => {
			// Skip the current preview (don't count self as duplicate).
			if (p === preview) return false;

			// Skip if we don't have a note
			if (!preview.note) return false;

			// Skip if other does not have a note
			if (!p.note) return false;

			// Skip differing notes (not duplicate).
			if (p.note.id !== preview.note.id) return false;

			// Skip later previews (keep the earliest instance)
			if (i > index) return false;

			// If we get here, then "preview" is a duplicate of "p" and should be skipped.
			return true;
		}));

	// eslint-disable-next-line no-param-reassign
	previews = previews
		// Remove any previews where the note duplicates url
		.filter((preview, index) => !previews.some((p, i) => {
			// Skip the current preview (don't count self as duplicate).
			if (p === preview) return false;

			// Skip if we have a note
			if (preview.note) return false;

			// Skip if other does not have a note
			if (!p.note) return false;

			// Skip later previews (keep the earliest instance)
			if (i > index) return false;

			const noteUrls = getNoteUrls(p.note);

			// Remove if other duplicates our AP URL
			if (preview.activityPub && noteUrls.includes(preview.activityPub)) return true;

			// Remove if other duplicates our main URL
			return noteUrls.includes(preview.url);
		}));

	return previews;
}

// Kick everything off, and watch for changes.
watch(
	[urls, () => props.showAsQuote, () => props.skipNoteIds],
	() => refresh(),
	{ immediate: true },
);
</script>

<style module lang="scss">
.loading {
	box-shadow: 0 0 0 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius-sm);
}
</style>
