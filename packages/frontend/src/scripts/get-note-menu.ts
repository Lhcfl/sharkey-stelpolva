/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent, Ref } from 'vue';
import * as Misskey from 'misskey-js';
import { claimAchievement } from './achievements.js';
import { $i } from '@/account.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import * as os from '@/os.js';
import copyToClipboard from '@/scripts/copy-to-clipboard.js';
import { url } from '@/config.js';
import { defaultStore, noteActions } from '@/store.js';
import { miLocalStorage } from '@/local-storage.js';
import { getUserMenu } from '@/scripts/get-user-menu.js';
import { clipsCache } from '@/cache.js';
import { MenuItem } from '@/types/menu.js';

export async function getNoteClipMenu(props: {
	note: Misskey.entities.Note;
	isDeleted: Ref<boolean>;
	currentClip?: Misskey.entities.Clip;
}) {
	const isRenote = (
		props.note.renote != null &&
		props.note.text == null &&
		props.note.fileIds.length === 0 &&
		props.note.poll == null
	);

	const appearNote = isRenote ? props.note.renote as Misskey.entities.Note : props.note;

	const clips = await clipsCache.fetch();
	return [...clips.map(clip => ({
		text: clip.name,
		action: () => {
			claimAchievement('noteClipped1');
			os.promiseDialog(
				os.api('clips/add-note', { clipId: clip.id, noteId: appearNote.id }),
				null,
				async (err) => {
					if (err.id === '734806c4-542c-463a-9311-15c512803965') {
						const confirm = await os.confirm({
							type: 'warning',
							text: i18n.t('confirmToUnclipAlreadyClippedNote', { name: clip.name }),
						});
						if (!confirm.canceled) {
							os.apiWithDialog('clips/remove-note', { clipId: clip.id, noteId: appearNote.id });
							if (props.currentClip?.id === clip.id) props.isDeleted.value = true;
						}
					} else {
						os.alert({
							type: 'error',
							text: err.message + '\n' + err.id,
						});
					}
				},
			);
		},
	})), null, {
		icon: 'ph-plus ph-bold ph-lg',
		text: i18n.ts.createNew,
		action: async () => {
			const { canceled, result } = await os.form(i18n.ts.createNewClip, {
				name: {
					type: 'string',
					label: i18n.ts.name,
				},
				description: {
					type: 'string',
					required: false,
					multiline: true,
					label: i18n.ts.description,
				},
				isPublic: {
					type: 'boolean',
					label: i18n.ts.public,
					default: false,
				},
			});
			if (canceled) return;

			const clip = await os.apiWithDialog('clips/create', result);

			clipsCache.delete();

			claimAchievement('noteClipped1');
			os.apiWithDialog('clips/add-note', { clipId: clip.id, noteId: appearNote.id });
		},
	}];
}

export function getAbuseNoteMenu(note: misskey.entities.Note, text: string): MenuItem {
	return {
		icon: 'ph-warning-circle ph-bold ph-lg',
		text,
		action: (): void => {
			const u = note.url ?? note.uri ?? `${url}/notes/${note.id}`;
			os.popup(defineAsyncComponent(() => import('@/components/MkAbuseReportWindow.vue')), {
				user: note.user,
				initialComment: `Note: ${u}\n-----\n`,
			}, {}, 'closed');
		},
	};
}

export function getCopyNoteLinkMenu(note: misskey.entities.Note, text: string): MenuItem {
	return {
		icon: 'ph-link ph-bold ph-lg',
		text,
		action: (): void => {
			copyToClipboard(`${url}/notes/${note.id}`);
			os.success();
		},
	};
}

export function getCopyNoteOriginLinkMenu(note: misskey.entities.Note, text: string): MenuItem {
	return {
		icon: 'ph-link ph-bold ph-lg',
		text,
		action: (): void => {
			copyToClipboard(note.url ?? note.uri);
			os.success();
		},
	};
}

export function getNoteMenu(props: {
	note: Misskey.entities.Note;
	menuButton: Ref<HTMLElement>;
	translation: Ref<any>;
	translating: Ref<boolean>;
	isDeleted: Ref<boolean>;
	currentClip?: Misskey.entities.Clip;
}) {
	const isRenote = (
		props.note.renote != null &&
		props.note.text == null &&
		props.note.fileIds.length === 0 &&
		props.note.poll == null
	);

	const appearNote = isRenote ? props.note.renote as Misskey.entities.Note : props.note;

	const cleanups = [] as (() => void)[];

	function del(): void {
		os.confirm({
			type: 'warning',
			text: i18n.ts.noteDeleteConfirm,
		}).then(({ canceled }) => {
			if (canceled) return;

			os.api('notes/delete', {
				noteId: appearNote.id,
			});

			if (Date.now() - new Date(appearNote.createdAt).getTime() < 1000 * 60) {
				claimAchievement('noteDeletedWithin1min');
			}
		});
	}

	function delEdit(): void {
		os.confirm({
			type: 'warning',
			text: i18n.ts.deleteAndEditConfirm,
		}).then(({ canceled }) => {
			if (canceled) return;

			os.api('notes/delete', {
				noteId: appearNote.id,
			});

			os.post({ initialNote: appearNote, renote: appearNote.renote, reply: appearNote.reply, channel: appearNote.channel });

			if (Date.now() - new Date(appearNote.createdAt).getTime() < 1000 * 60) {
				claimAchievement('noteDeletedWithin1min');
			}
		});
	}

	function edit(): void {
		os.post({
			initialNote: appearNote,
			renote: appearNote.renote,
			reply: appearNote.reply,
			channel: appearNote.channel,
			editId: appearNote.id,
			initialFiles: appearNote.files,
		});
	}

	function toggleFavorite(favorite: boolean): void {
		claimAchievement('noteFavorited1');
		os.apiWithDialog(favorite ? 'notes/favorites/create' : 'notes/favorites/delete', {
			noteId: appearNote.id,
		});
	}

	function toggleThreadMute(mute: boolean): void {
		os.apiWithDialog(mute ? 'notes/thread-muting/create' : 'notes/thread-muting/delete', {
			noteId: appearNote.id,
		});
	}

	function copyContent(): void {
		copyToClipboard(appearNote.text);
		os.success();
	}

	function copyLink(): void {
		copyToClipboard(`${url}/notes/${appearNote.id}`);
		os.success();
	}

	function togglePin(pin: boolean): void {
		os.apiWithDialog(pin ? 'i/pin' : 'i/unpin', {
			noteId: appearNote.id,
		}, undefined, null, res => {
			if (res.id === '72dab508-c64d-498f-8740-a8eec1ba385a') {
				os.alert({
					type: 'error',
					text: i18n.ts.pinLimitExceeded,
				});
			}
		});
	}

	async function unclip(): Promise<void> {
		os.apiWithDialog('clips/remove-note', { clipId: props.currentClip.id, noteId: appearNote.id });
		props.isDeleted.value = true;
	}

	async function promote(): Promise<void> {
		const { canceled, result: days } = await os.inputNumber({
			title: i18n.ts.numberOfDays,
		});

		if (canceled) return;

		os.apiWithDialog('admin/promo/create', {
			noteId: appearNote.id,
			expiresAt: Date.now() + (86400000 * days),
		});
	}

	function share(): void {
		navigator.share({
			title: i18n.t('noteOf', { user: appearNote.user.name }),
			text: appearNote.text,
			url: `${url}/notes/${appearNote.id}`,
		});
	}

	function openDetail(): void {
		os.pageWindow(`/notes/${appearNote.id}`);
	}

	async function translate(): Promise<void> {
		if (props.translation.value != null) return;
		props.translating.value = true;
		const res = await os.api('notes/translate', {
			noteId: appearNote.id,
			targetLang: miLocalStorage.getItem('lang') ?? navigator.language,
		});
		props.translating.value = false;
		props.translation.value = res;
	}

	let menu: MenuItem[];
	if ($i) {
		const statePromise = os.api('notes/state', {
			noteId: appearNote.id,
		});

		menu = [
			...(
				props.currentClip?.userId === $i.id ? [{
					icon: 'ph-backspace ph-bold ph-lg',
					text: i18n.ts.unclip,
					danger: true,
					action: unclip,
				}, null] : []
			), {
				icon: 'ph-info ph-bold ph-lg',
				text: i18n.ts.details,
				action: openDetail,
			}, {
				icon: 'ph-copy ph-bold ph-lg',
				text: i18n.ts.copyContent,
				action: copyContent,
			}, getCopyNoteLinkMenu(appearNote, i18n.ts.copyLink)
			, (appearNote.url || appearNote.uri) ? 
				getCopyNoteOriginLinkMenu(appearNote, 'Copy link (Origin)')
			: undefined,
			(appearNote.url || appearNote.uri) ? {
				icon: 'ph-arrow-square-out ph-bold ph-lg',
				text: i18n.ts.showOnRemote,
				action: () => {
					window.open(appearNote.url ?? appearNote.uri, '_blank');
				},
			} : undefined,
			{
				icon: 'ph-share-network ph-bold ph-lg',
				text: i18n.ts.share,
				action: share,
			},
			$i && $i.policies.canUseTranslator && instance.translatorAvailable ? {
				icon: 'ph-translate ph-bold ph-lg',
				text: i18n.ts.translate,
				action: translate,
			} : undefined,
			null,
			statePromise.then(state => state.isFavorited ? {
				icon: 'ph-star-half ph-bold ph-lg',
				text: i18n.ts.unfavorite,
				action: () => toggleFavorite(false),
			} : {
				icon: 'ph-star ph-bold ph-lg',
				text: i18n.ts.favorite,
				action: () => toggleFavorite(true),
			}),
			{
				type: 'parent' as const,
				icon: 'ph-paperclip ph-bold ph-lg',
				text: i18n.ts.clip,
				children: () => getNoteClipMenu(props),
			},
			statePromise.then(state => state.isMutedThread ? {
				icon: 'ph-bell-slash ph-bold ph-lg',
				text: i18n.ts.unmuteThread,
				action: () => toggleThreadMute(false),
			} : {
				icon: 'ph-bell-slash ph-bold ph-lg',
				text: i18n.ts.muteThread,
				action: () => toggleThreadMute(true),
			}),
			appearNote.userId === $i.id ? ($i.pinnedNoteIds ?? []).includes(appearNote.id) ? {
				icon: 'ph-push-pin ph-bold ph-lgned-off',
				text: i18n.ts.unpin,
				action: () => togglePin(false),
			} : {
				icon: 'ph-push-pin ph-bold ph-lg',
				text: i18n.ts.pin,
				action: () => togglePin(true),
			} : undefined,
			{
				type: 'parent' as const,
				icon: 'ph-user ph-bold ph-lg',
				text: i18n.ts.user,
				children: async () => {
					const user = appearNote.userId === $i?.id ? $i : await os.api('users/show', { userId: appearNote.userId });
					const { menu, cleanup } = getUserMenu(user);
					cleanups.push(cleanup);
					return menu;
				},
			},
			/*
		...($i.isModerator || $i.isAdmin ? [
			null,
			{
				icon: 'ph-megaphone ph-bold ph-lg',
				text: i18n.ts.promote,
				action: promote
			}]
			: []
		),*/
			...(appearNote.userId !== $i.id ? [
				null,
				appearNote.userId !== $i.id ? getAbuseNoteMenu(appearNote, i18n.ts.reportAbuse) : undefined,
			]
			: []
			),
			...(appearNote.userId === $i.id || $i.isModerator || $i.isAdmin ? [
				null,
				appearNote.userId === $i.id ? {
					icon: 'ph-pencil ph-bold ph-lg',
					text: i18n.ts.edit,
					action: edit,
				} : undefined,
				{
					icon: 'ph-pencil-line ph-bold ph-lg',
					text: i18n.ts.deleteAndEdit,
					danger: true,
					action: delEdit,
				}, 
				{
					icon: 'ph-trash ph-bold ph-lg',
					text: i18n.ts.delete,
					danger: true,
					action: del,
				}]
			: []
			)]
			.filter(x => x !== undefined);
	} else {
		menu = [{
			icon: 'ph-info ph-bold ph-lg',
			text: i18n.ts.details,
			action: openDetail,
		}, {
			icon: 'ph-copy ph-bold ph-lg',
			text: i18n.ts.copyContent,
			action: copyContent,
		}, getCopyNoteLinkMenu(appearNote, i18n.ts.copyLink)
		, (appearNote.url || appearNote.uri) ? 
			getCopyNoteOriginLinkMenu(appearNote, 'Copy link (Origin)')
		: undefined,
		(appearNote.url || appearNote.uri) ? {
			icon: 'ph-arrow-square-out ph-bold ph-lg',
			text: i18n.ts.showOnRemote,
			action: () => {
				window.open(appearNote.url ?? appearNote.uri, '_blank');
			},
		} : undefined]
			.filter(x => x !== undefined);
	}

	if (noteActions.length > 0) {
		menu = menu.concat([null, ...noteActions.map(action => ({
			icon: 'ph-plug ph-bold ph-lg',
			text: action.title,
			action: () => {
				action.handler(appearNote);
			},
		}))]);
	}

	if (defaultStore.state.devMode) {
		menu = menu.concat([null, {
			icon: 'ph-identification-card ph-bold ph-lg',
			text: i18n.ts.copyNoteId,
			action: () => {
				copyToClipboard(appearNote.id);
			},
		}]);
	}

	const cleanup = () => {
		if (_DEV_) console.log('note menu cleanup', cleanups);
		for (const cl of cleanups) {
			cl();
		}
	};

	return {
		menu,
		cleanup,
	};
}
