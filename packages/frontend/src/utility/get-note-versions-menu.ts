/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from './misskey-api.js';
import { dateTimeFormat } from './intl-const.js';
import type { MenuItem } from '@/types/menu.js';
import * as os from '@/os.js';

interface NoteEdit {
	oldDate: string;
	updatedAt: string;
	text: string | null;
}

export async function getNoteVersionsMenu(props: { note: Misskey.entities.Note }) {
	const isRenote = (
		props.note.renote != null &&
		props.note.text == null &&
		!props.note.fileIds?.length &&
		props.note.poll == null
	);

	const appearNote = isRenote ? props.note.renote as Misskey.entities.Note : props.note;

	const cleanups = [] as (() => void)[];

	function openVersion(info: NoteEdit): void {
		const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/SkOldNoteWindow.vue')), {
			note: appearNote,
			oldText: info.text ?? '',
			updatedAt: info.updatedAt,
		}, {
			closed: () => dispose(),
		});
	}

	const menu: MenuItem[] = [];
	const statePromise = misskeyApi('notes/versions', {
		noteId: appearNote.id,
	});

	await statePromise.then((versions) => {
		for (const edit of versions) {
			menu.push({
				icon: 'ph-pencil-simple ph-bold ph-lg',
				text: dateTimeFormat.format(new Date(edit.oldDate)),
				action: () => openVersion(edit),
			});
		}
	});

	const cleanup = () => {
		if (_DEV_) console.debug('note menu cleanup', cleanups);
		for (const cl of cleanups) {
			cl();
		}
	};

	return {
		menu,
		cleanup,
	};
}
