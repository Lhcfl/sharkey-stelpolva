/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { vi } from 'vitest';
import { computed, ref } from 'vue';
import createFetchMock from 'vitest-fetch-mock';
import type * as Misskey from 'misskey-js';
import type { prefer } from '@/preferences.js';
import type { PreferencesManager } from '@/preferences/manager.js';

const fetchMocker = createFetchMock(vi);
fetchMocker.enableMocks();

// Set i18n
import { locales } from 'locales';
import { updateI18n } from '@/i18n.js';
updateI18n(locales['en-US']);

// XXX: misskey-js panics if WebSocket is not defined
vi.stubGlobal('WebSocket', class WebSocket extends EventTarget { static CLOSING = 2; });

export const preferState: Partial<typeof prefer['s']> = {

	// なんかtestがうまいこと動かないのでここに書く
	dataSaver: {
		media: false,
		avatar: false,
		urlPreview: false,
		code: false,
	},

};

const preferReactive = new Proxy(preferState, {
	get(target, prop) {
		return ref(target[prop]);
	},
}) as unknown as typeof prefer['r'];

// XXX: store somehow becomes undefined in vitest?
// https://vitest.dev/guide/mocking/modules.html
vi.mock(import('@/preferences.js'), () => {
	return {
		prefer: {
			s: preferState,
			r: preferReactive,
		} as PreferencesManager,
	};
});

// Add mocks for Web Audio API
const AudioNodeMock = vi.fn(() => ({
	connect: vi.fn(() => ({ connect: vi.fn() })),
	start: vi.fn(),
}));

const GainNodeMock = vi.fn(() => ({
	gain: vi.fn(),
}));

const AudioContextMock = vi.fn(() => ({
	createBufferSource: vi.fn(() => new AudioNodeMock()),
	createGain: vi.fn(() => new GainNodeMock()),
	decodeAudioData: vi.fn(),
}));

vi.stubGlobal('AudioContext', AudioContextMock);

// Mock server meta
export const mockMeta: Partial<Misskey.entities.MetaDetailed> = {
	uri: 'https://example.com',
	policies: {} as Misskey.entities.MetaDetailed['policies'],
};

// https://vitest.dev/guide/mocking/modules.html
vi.mock(import('@/instance.js'), () => ({
	instance: mockMeta as Misskey.entities.MetaDetailed,
	policies: computed(() => mockMeta.policies as Misskey.entities.MetaDetailed['policies']),
	fetchInstance() {
		return Promise.resolve(mockMeta as Misskey.entities.MetaDetailed);
	},
}));
