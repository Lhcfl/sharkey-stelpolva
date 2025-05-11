/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Keys taken from:
// - https://docs.joinmastodon.org/methods/accounts/#statuses
// - https://docs.joinmastodon.org/methods/timelines/#public
// - https://docs.joinmastodon.org/methods/timelines/#tag
export interface TimelineArgs {
	max_id?: string;
	min_id?: string;
	since_id?: string;
	limit?: string;
	offset?: string;
	local?: string;
	pinned?: string;
	exclude_reblogs?: string;
	exclude_replies?: string;
	only_media?: string;
}

// Values taken from https://docs.joinmastodon.org/client/intro/#boolean
export function toBoolean(value: string | undefined): boolean | undefined {
	if (!value) return undefined;
	return !['0', 'f', 'F', 'false', 'FALSE', 'off', 'OFF'].includes(value);
}

export function toInt(value: string | undefined): number | undefined {
	if (!value) return undefined;
	return parseInt(value);
}

export function parseTimelineArgs(q: TimelineArgs) {
	return {
		max_id: q.max_id,
		min_id: q.min_id,
		since_id: q.since_id,
		limit: typeof(q.limit) === 'string' ? parseInt(q.limit, 10) : undefined,
		offset: typeof(q.offset) === 'string' ? parseInt(q.offset, 10) : undefined,
		local: typeof(q.local) === 'string' ? toBoolean(q.local) : undefined,
		pinned: typeof(q.pinned) === 'string' ? toBoolean(q.pinned) : undefined,
		exclude_reblogs: typeof(q.exclude_reblogs) === 'string' ? toBoolean(q.exclude_reblogs) : undefined,
		exclude_replies: typeof(q.exclude_replies) === 'string' ? toBoolean(q.exclude_replies) : undefined,
		only_media: typeof(q.only_media) === 'string' ? toBoolean(q.only_media) : undefined,
	};
}
