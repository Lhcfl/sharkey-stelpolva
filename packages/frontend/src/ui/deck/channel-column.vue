<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<XColumn :menu="menu" :column="column" :isStacked="isStacked" :refresher="() => timeline.reloadTimeline()">
	<template #header>
		<i class="ph-television ph-bold ph-lg"></i><span style="margin-left: 8px;">{{ column.name }}</span>
	</template>

	<template v-if="column.channelId">
		<div style="padding: 8px; text-align: center;">
			<MkButton primary gradate rounded inline small @click="post"><i class="ph-pencil-simple ph-bold ph-lg"></i></MkButton>
		</div>
		<MkTimeline ref="timeline" src="channel" :key="column.channelId + column.withRenotes + column.onlyFiles" :channel="column.channelId" :withRenotes="withRenotes" :onlyFiles="onlyFiles" @note="onNote"/>
	</template>
</XColumn>
</template>

<script lang="ts" setup>
import { ref, shallowRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import XColumn from './column.vue';
import { updateColumn, Column } from './deck-store.js';
import MkTimeline from '@/components/MkTimeline.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { favoritedChannelsCache } from '@/cache.js';
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
const channel = shallowRef<Misskey.entities.Channel>();
const withRenotes = ref(props.column.withRenotes ?? true);
const onlyFiles = ref(props.column.onlyFiles ?? false);

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

const soundSetting = ref<SoundStore>(props.column.soundSetting ?? { type: null, volume: 1 });

if (props.column.channelId == null) {
	setChannel();
}

watch(soundSetting, v => {
	updateColumn(props.column.id, { soundSetting: v });
});

async function setChannel() {
	const channels = await favoritedChannelsCache.fetch();
	const { canceled, result: chosenChannel } = await os.select({
		title: i18n.ts.selectChannel,
		items: channels.map(x => ({
			value: x, text: x.name,
		})),
		default: props.column.channelId,
	});
	if (canceled || chosenChannel == null) return;
	updateColumn(props.column.id, {
		channelId: chosenChannel.id,
		name: chosenChannel.name,
	});
}

async function post() {
	if (!channel.value || channel.value.id !== props.column.channelId) {
		channel.value = await misskeyApi('channels/show', {
			channelId: props.column.channelId,
		});
	}

	os.post({
		channel: channel.value,
	});
}

function onNote() {
	sound.playMisskeySfxFile(soundSetting.value);
}

const menu: MenuItem[] = [{
	icon: 'ph-pencil-simple ph-bold ph-lg',
	text: i18n.ts.selectChannel,
	action: setChannel,
}, {
	type: 'switch',
	text: i18n.ts.showRenotes,
	ref: withRenotes,
}, {
	type: 'switch',
	text: i18n.ts.fileAttachedOnly,
	ref: onlyFiles,
}, {
	icon: 'ph-bell-ringing ph-bold ph-lg',
	text: i18n.ts._deck.newNoteNotificationSettings,
	action: () => soundSettingsButton(soundSetting),
}];
</script>
