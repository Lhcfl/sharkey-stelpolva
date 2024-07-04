/*
 * SPDX-FileCopyrightText: dakkar and sharkey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import type { IObject } from '../type.js';

function getHrefFrom(one: IObject|string): string | undefined {
	if (typeof(one) === 'string') return one;
	return one.href;
}

export function assertActivityMatchesUrls(activity: IObject, urls: string[]) {
	const idOk = activity.id !== undefined && urls.includes(activity.id);
	if (idOk) return;

	const url = activity.url;
	if (url) {
		// `activity.url` can be an `ApObject = IObject | string | (IObject
		// | string)[]`, we have to look inside it
		const activityUrls = Array.isArray(url) ? url.map(getHrefFrom) : [getHrefFrom(url)];
		const goodUrl = activityUrls.find(u => u && urls.includes(u));

		if (goodUrl) return;
	}

	throw new Error(`bad Activity: neither id(${activity?.id}) nor url(${JSON.stringify(activity?.url)}) match location(${urls})`);
}
