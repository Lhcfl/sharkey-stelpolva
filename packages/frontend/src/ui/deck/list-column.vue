<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<XColumn :menu="menu" :column="column" :isStacked="isStacked" :refresher="() => timeline.reloadTimeline()">
	<template #header>
		<i class="ph-list ph-bold ph-lg"></i><span style="margin-left: 8px;">{{ column.name }}</span>
	</template>

	<MkTimeline v-if="column.listId" ref="timeline" :key="column.listId + column.withRenotes + column.onlyFiles" src="list" :list="column.listId" :withRenotes="withRenotes" :onlyFiles="onlyFiles" @note="onNote"/>
</XColumn>
</template>

<script lang="ts" setup>
import { watch, shallowRef, ref } from 'vue';
import XColumn from './column.vue';
import { updateColumn, Column } from './deck-store.js';
import MkTimeline from '@/components/MkTimeline.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { i18n } from '@/i18n.js';
import { MenuItem } from '@/types/menu.js';
import { SoundStore } from '@/store.js';
import { soundSettingsButton } from '@/ui/deck/tl-note-notification.js';
import * as sound from '@/scripts/sound.js';

const props = defineProps<{
	column: Column;
	isStacked: boolean;
}>();

const timeline = shallowRef<InstanceType<typeof MkTimeline>>();
const withRenotes = ref(props.column.withRenotes ?? true);
const onlyFiles = ref(props.column.onlyFiles ?? false);
const soundSetting = ref<SoundStore>(props.column.soundSetting ?? { type: null, volume: 1 });

if (props.column.listId == null) {
	setList();
}

watch(withRenotes, v => {
	updateColumn(props.column.id, {
		withRenotes: v,
	});
});

watch(onlyFiles, v => {
	updateColumn(props.column.id, {
		onlyFiles: v,
	});
});

watch(soundSetting, v => {
	updateColumn(props.column.id, { soundSetting: v });
});

async function setList() {
	const lists = await misskeyApi('users/lists/list');
	const { canceled, result: list } = await os.select({
		title: i18n.ts.selectList,
		items: lists.map(x => ({
			value: x, text: x.name,
		})),
		default: props.column.listId,
	});
	if (canceled) return;
	updateColumn(props.column.id, {
		listId: list.id,
	});
}

function editList() {
	os.pageWindow('my/lists/' + props.column.listId);
}

function onNote() {
	sound.playMisskeySfxFile(soundSetting.value);
}

const menu: MenuItem[] = [
	{
		icon: 'ph-pencil-simple ph-bold ph-lg',
		text: i18n.ts.selectList,
		action: setList,
	},
	{
		icon: 'ph-gear ph-bold ph-lg',
		text: i18n.ts.editList,
		action: editList,
	},
	{
		type: 'switch',
		text: i18n.ts.showRenotes,
		ref: withRenotes,
	},
	{
		type: 'switch',
		text: i18n.ts.fileAttachedOnly,
		ref: onlyFiles,
	},
	{
		icon: 'ph-bell-ringing ph-bold ph-lg',
		text: i18n.ts._deck.newNoteNotificationSettings,
		action: () => soundSettingsButton(soundSetting),
	},
];
</script>
