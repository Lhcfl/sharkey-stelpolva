/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent } from 'vue';
import type { MenuItem } from '@/types/menu.js';
import * as os from '@/os.js';
import { instance } from '@/instance.js';
import { host } from '@/config.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/account.js';

function toolsMenuItems(): MenuItem[] {
	return [{
		type: 'link',
		to: '/scratchpad',
		text: i18n.ts.scratchpad,
		icon: 'ti ti-terminal-2',
	}, {
		type: 'link',
		to: '/api-console',
		text: 'API Console',
		icon: 'ti ti-terminal-2',
	}, {
		type: 'link',
		to: '/clicker',
		text: '🍪👈',
		icon: 'ti ti-cookie',
	}, ($i && ($i.isAdmin || $i.policies.canManageCustomEmojis)) ? {
		type: 'link',
		to: '/custom-emojis-manager',
		text: i18n.ts.manageCustomEmojis,
		icon: 'ph-smiley ph-bold ph-lg',
	} : undefined, ($i && ($i.isAdmin || $i.policies.canManageAvatarDecorations)) ? {
		type: 'link',
		to: '/avatar-decorations',
		text: i18n.ts.manageAvatarDecorations,
		icon: 'ph-sparkle ph-bold ph-lg',
	} : undefined];
}

export function openInstanceMenu(ev: MouseEvent) {
	os.popupMenu([{
		text: instance.name ?? host,
		type: 'label',
	}, {
		type: 'link',
		text: i18n.ts.instanceInfo,
		icon: 'ti ti-info-circle',
		to: '/about',
	}, {
		type: 'link',
		text: i18n.ts.customEmojis,
		icon: 'ph-smiley ph-bold ph-lg',
		to: '/about#emojis',
	}, {
		type: 'link',
		text: i18n.ts.federation,
		icon: 'ph-globe-hemisphere-west ph-bold ph-lg',
		to: '/about#federation',
	}, {
		type: 'link',
		text: i18n.ts.charts,
		icon: 'ph-chart-line ph-bold ph-lg',
		to: '/about#charts',
	}, { type: 'divider' }, {
		type: 'link',
		text: i18n.ts.ads,
		icon: 'ph-flag ph-bold ph-lg',
		to: '/ads',
	}, ($i && ($i.isAdmin || $i.policies.canInvite) && instance.disableRegistration) ? {
		type: 'link',
		to: '/invite',
		text: i18n.ts.invite,
		icon: 'ph-user-plus ph-bold ph-lg',
	} : undefined, {
		type: 'parent',
		text: i18n.ts.tools,
		icon: 'ph-toolbox ph-bold ph-lg',
		children: toolsMenuItems(),
	}, { type: 'divider' }, {
		type: 'link',
		text: i18n.ts.inquiry,
		icon: 'ph-question ph-bold ph-lg',
		to: '/contact',
	}, (instance.impressumUrl) ? {
		text: i18n.ts.impressum,
		icon: 'ph-newspaper-clipping ph-bold ph-lg',
		action: () => {
			window.open(instance.impressumUrl, '_blank', 'noopener');
		},
	} : undefined, (instance.tosUrl) ? {
		text: i18n.ts.termsOfService,
		icon: 'ph-notebook ph-bold ph-lg',
		action: () => {
			window.open(instance.tosUrl, '_blank', 'noopener');
		},
	} : undefined, (instance.privacyPolicyUrl) ? {
		text: i18n.ts.privacyPolicy,
		icon: 'ti ti-shield-lock',
		action: () => {
			window.open(instance.privacyPolicyUrl, '_blank', 'noopener');
		},
	} : undefined, (instance.donationUrl) ? {
		text: i18n.ts.donation,
		icon: 'ph-hand-coins ph-bold ph-lg',
		action: () => {
			window.open(instance.donationUrl, '_blank', 'noopener');
		},
	} : undefined, (!instance.impressumUrl && !instance.tosUrl && !instance.privacyPolicyUrl && !instance.donationUrl) ? undefined : { type: 'divider' }, {
		text: i18n.ts.document,
		icon: 'ph-libghtbulb ph-bold ph-lg',
		action: () => {
			window.open('https://misskey-hub.net/docs/for-users/', '_blank', 'noopener');
		},
	}, ($i) ? {
		text: i18n.ts._initialTutorial.launchTutorial,
		icon: 'ph-presentation ph-bold ph-lg',
		action: () => {
			os.popup(defineAsyncComponent(() => import('@/components/MkTutorialDialog.vue')), {}, {}, 'closed');
		},
	} : undefined, {
		type: 'link',
		text: i18n.ts.aboutMisskey,
		icon: 'sk-icons sk-shark ph-bold',
		to: '/about-sharkey',
	}], ev.currentTarget ?? ev.target, {
		align: 'left',
	});
}

export function openToolsMenu(ev: MouseEvent) {
	os.popupMenu(toolsMenuItems(), ev.currentTarget ?? ev.target, {
		align: 'left',
	});
}
