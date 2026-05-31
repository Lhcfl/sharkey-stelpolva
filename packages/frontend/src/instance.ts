/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, reactive } from 'vue';
import type * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { miLocalStorage } from '@/local-storage.js';
import { $i } from '@/i.js';

// TODO: 他のタブと永続化されたstateを同期

// Refresh at startup if cache is older than this.
const minMetaAge = 1000 * 3; // 3 seconds

// Refresh at fetchInstance if cache is older than this.
const maxMetaAge = 1000 * 60 * 60; // 1 hour

//#region loader
const providedMetaEl = window.document.getElementById('misskey_meta');
const providedMeta = computed<CachedMeta | null>(() => {
	const providedAtValue = providedMetaEl?.dataset.generatedAt;
	const providedMetaValue = providedMetaEl?.textContent;
	return providedAtValue && providedMetaValue
		? { at: parseInt(providedAtValue), meta: JSON.parse(providedMetaValue) }
		: null;
});

const cachedMeta = computed<CachedMeta | null>({
	get: () => {
		const cachedAtValue = miLocalStorage.getItem('instanceCachedAt');
		const cachedMetaValue = miLocalStorage.getItem('instance');
		return cachedAtValue && cachedMetaValue
			? { at: parseInt(cachedAtValue), meta: JSON.parse(cachedMetaValue) }
			: null;
	},
	set: (cached) => {
		if (cached) {
			miLocalStorage.setItem('instance', JSON.stringify(cached.meta));
			miLocalStorage.setItem('instanceCachedAt', cached.at.toString());
		} else {
			miLocalStorage.removeItem('instance');
			miLocalStorage.removeItem('instanceCachedAt');
		}
	},
});

function fetchMetaFromCache(): CachedMeta | null {
	// If provided data is newer than cached, then update cache and use it.
	if (providedMeta.value && (!cachedMeta.value || providedMeta.value.at > cachedMeta.value.at)) {
		cachedMeta.value = providedMeta.value;
		return providedMeta.value;
	}

	// If cached data is newer (or nothing was provided), then use it directly.
	if (cachedMeta.value) {
		return cachedMeta.value;
	}

	return null;
}

async function createInstance(): Promise<Misskey.entities.MetaDetailed> {
	try {
		// Pull from localStorage or page embed
		const cached = fetchMetaFromCache();
		if (cached) {
			// Start an async refresh if cache is stale.
			// Randomized delay prevents 429 if many tabs reload, and no maxMetaAge ensures the page always loads fast.
			if (Date.now() - cached.at > minMetaAge) {
				window.setTimeout(() => {
					fetchInstance(true).catch(err => {
						console.warn('Failed to refresh instance meta, using stale cache', err);
					});
				}, 10_1000 * Math.abs(Math.random()));
			}

			return cached.meta;
		}

		// If neither source is available, then fetch, update cache, and use that.
		const fetchedMeta = await misskeyApi<Misskey.entities.MetaDetailed>('meta', { detail: true });
		cachedMeta.value = {
			meta: fetchedMeta,
			at: Date.now(),
		};
		return fetchedMeta;
	} catch (err) {
		console.error('Initial meta fetch failed:', err);
		throw err;
	}
}
//#endregion

const initialMeta = await createInstance();
export const instance: Readonly<Misskey.entities.MetaDetailed> = reactive(initialMeta);
export const policies = computed<Readonly<Misskey.entities.RolePolicies>>(() => $i?.policies ?? instance.policies);

export async function fetchInstance(force = false): Promise<Misskey.entities.MetaDetailed> {
	if (!force && cachedMeta.value) {
		if (Date.now() - cachedMeta.value.at < maxMetaAge) {
			return instance;
		}
	}

	const meta = await misskeyApi('meta', {
		detail: true,
	});

	for (const [k, v] of Object.entries(meta)) {
		instance[k] = v;
	}

	cachedMeta.value = {
		meta: instance,
		at: Date.now(),
	};

	return instance;
}

interface CachedMeta {
	at: number;
	meta: Misskey.entities.MetaDetailed;
}
