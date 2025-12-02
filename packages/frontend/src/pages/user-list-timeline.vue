<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :displayBackButton="true" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 800px;">
		<div ref="rootEl">
			<div v-if="queue > 0" :class="$style.new"><button class="_buttonPrimary" :class="$style.newButton" @click="top()">{{ i18n.ts.newNoteRecived }}</button></div>
			<div :class="$style.tl">
				<MkTimeline
					ref="tlEl" :key="listId + withRenotes + onlyFiles"
					src="list"
					:list="listId"
					:sound="true"
					:withRenotes="withRenotes"
					:onlyFiles="onlyFiles"
					@queue="queueUpdated"
				/>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, watch, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import { scrollInContainer } from '@@/js/scroll.js';
import MkTimeline from '@/components/MkTimeline.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import { deepMerge } from '@/utility/merge.js';
import { useMuteOverrides } from '@/utility/check-word-mute.js';
import { store } from '@/store.js';
import { $i } from '@/i.js';
import * as os from '@/os.js';

const router = useRouter();

const props = defineProps<{
	listId: string;
}>();

const list = ref<Misskey.entities.UserList | null>(null);
const queue = ref(0);
const tlEl = useTemplateRef('tlEl');
const rootEl = useTemplateRef('rootEl');

const withRenotes = computed<boolean>({
	get: () => store.r.tl.value.filter.withRenotes,
	set: (x) => saveTlFilter('withRenotes', x),
});

const onlyFiles = computed<boolean>({
	get: () => store.r.tl.value.filter.onlyFiles,
	set: (x) => saveTlFilter('onlyFiles', x),
});

function saveTlFilter(key: keyof typeof store.s.tl.filter, newValue: boolean) {
	if (key !== 'withReplies' || $i) {
		store.r.tl.value = deepMerge({ filter: { [key]: newValue } }, store.s.tl);
	}
}

const muteOverrides = useMuteOverrides();

watch(() => props.listId, async () => {
	const _list = await misskeyApi('users/lists/show', {
		listId: props.listId,
	});
	list.value = _list;

	// Disable mandatory CW for all list members
	muteOverrides.user = {}; // Reset prior
	for (const userId of _list.userIds) {
		muteOverrides.user[userId] = {
			userMandatoryCW: null,
			instanceMandatoryCW: null,
		};
	}
}, { immediate: true });

function queueUpdated(q) {
	queue.value = q;
}

function top() {
	if (!rootEl.value) return;
	scrollInContainer(rootEl.value, { top: 0 });
}

function settings() {
	router.push(`/my/lists/${props.listId}`);
}

const headerActions = computed(() => list.value ? [{
	icon: 'ph-dots-three ph-bold ph-lg',
	text: i18n.ts.options,
	handler: (ev) => {
		os.popupMenu([{
			type: 'switch',
			text: i18n.ts.showRenotes,
			ref: withRenotes,
		}, {
			type: 'switch',
			text: i18n.ts.fileAttachedOnly,
			ref: onlyFiles,
		}], ev.currentTarget ?? ev.target);
	},
}, {
	icon: 'ti ti-settings',
	text: i18n.ts.settings,
	handler: settings,
}] : []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: list.value ? list.value.name : i18n.ts.lists,
	icon: 'ti ti-list',
}));
</script>

<style lang="scss" module>
.new {
	position: sticky;
	top: calc(var(--MI-stickyTop, 0px) + 16px);
	z-index: 1000;
	width: 100%;
	margin: calc(-0.675em - 8px) 0;

	&:first-child {
		margin-top: calc(-0.675em - 8px - var(--MI-margin));
	}
}

.newButton {
	display: block;
	margin: var(--MI-margin) auto 0 auto;
	padding: 8px 16px;
	border-radius: var(--MI-radius-xl);
}

.tl {
	background: var(--MI_THEME-bg);
	border-radius: var(--MI-radius);
	overflow: clip;
}
</style>
