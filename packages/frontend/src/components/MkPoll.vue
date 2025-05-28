<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="{ [$style.done]: closed || isVoted }">
	<ul :class="$style.choices">
		<li v-for="(choice, i) in props.poll.choices" :key="i" :class="$style.choice" @click="vote(i)">
			<div :class="$style.bg" :style="{ 'width': `${showResult ? (choice.votes / total * 100) : 0}%` }"></div>
			<span :class="$style.fg">
				<template v-if="choice.isVoted"><i class="ti ti-check" style="margin-right: 4px; color: var(--MI_THEME-accent);"></i></template>
				<Mfm :text="choice.text" :plain="true" :author="author" :emojiUrls="emojiUrls"/>
				<span v-if="showResult" style="margin-left: 4px; opacity: 0.7;">({{ i18n.tsx._poll.votesCount({ n: choice.votes }) }})</span>
			</span>
		</li>
	</ul>
	<p v-if="!readOnly" :class="$style.info">
		<span>{{ i18n.tsx._poll.totalVotes({ n: total }) }}</span>
		<span v-if="poll.multiple"> · </span>
		<span v-if="poll.multiple" style="color: var(--MI_THEME-accent); font-weight: bolder;">{{ i18n.ts._poll.multiple }}</span>
		<span> · </span>
		<a v-if="!closed && !isVoted" style="color: inherit;" @click="showResult = !showResult">{{ showResult ? i18n.ts._poll.vote : i18n.ts._poll.showResult }}</a>
		<span v-if="isVoted">{{ i18n.ts._poll.voted }}</span>
		<span v-else-if="closed">{{ i18n.ts._poll.closed }}</span>
		<span v-if="remaining > 0"> · {{ timer }}</span>
		<span v-if="!closed && $i && !props.local"> · </span>
		<a v-if="!closed && $i && !props.local" style="color: inherit;" @click="refreshVotes()">{{ i18n.ts.reload }}</a>
	</p>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import * as config from '@@/js/config.js';
import { useInterval } from '@@/js/use-interval.js';
import type { OpenOnRemoteOptions } from '@/utility/please-login.js';
import { sum } from '@/utility/array.js';
import { pleaseLogin } from '@/utility/please-login.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';

const props = defineProps<{
	noteId: string;
	poll: NonNullable<Misskey.entities.Note['poll']>;
	readOnly?: boolean;
	local?: boolean;
	emojiUrls?: Record<string, string>;
	author?: Misskey.entities.UserLite;
}>();

const remaining = ref(-1);

const total = computed(() => sum(props.poll.choices.map(x => x.votes)));
const closed = computed(() => remaining.value === 0);
const isVoted = computed(() => !props.poll.multiple && props.poll.choices.some(c => c.isVoted));
const timer = computed(() => i18n.tsx._poll[
	remaining.value >= 86400 ? 'remainingDays' :
	remaining.value >= 3600 ? 'remainingHours' :
	remaining.value >= 60 ? 'remainingMinutes' : 'remainingSeconds'
]({
	s: Math.floor(remaining.value % 60),
	m: Math.floor(remaining.value / 60) % 60,
	h: Math.floor(remaining.value / 3600) % 24,
	d: Math.floor(remaining.value / 86400),
}));

const showResult = ref(props.readOnly || isVoted.value);

const pleaseLoginContext = computed<OpenOnRemoteOptions>(() => ({
	type: 'lookup',
	url: `${config.url}/notes/${props.noteId}`,
}));

// 期限付きアンケート
if (props.poll.expiresAt) {
	const tick = () => {
		remaining.value = Math.floor(Math.max(new Date(props.poll.expiresAt!).getTime() - Date.now(), 0) / 1000);
		if (remaining.value === 0) {
			showResult.value = true;
		}
	};

	useInterval(tick, 3000, {
		immediate: true,
		afterMounted: false,
	});
}

const vote = async (id) => {
	if (props.readOnly || closed.value || isVoted.value) return;

	pleaseLogin({ openOnRemote: pleaseLoginContext.value });

	if (!props.poll.multiple) {
		const { canceled } = await os.confirm({
			type: 'question',
			text: i18n.tsx.voteConfirm({ choice: props.poll.choices[id].text }),
		});
		if (canceled) return;
	} else {
		const { canceled } = await os.confirm({
			type: 'question',
			text: i18n.tsx.voteConfirmMulti({ choice: props.poll.choices[id].text }),
		});
		if (canceled) return;
	}

	await misskeyApi('notes/polls/vote', {
		noteId: props.noteId,
		choice: id,
	});
	if (!showResult.value) showResult.value = !props.poll.multiple;
};

const refreshVotes = async () => {
	pleaseLogin({ openOnRemote: pleaseLoginContext.value });

	if (props.readOnly || closed.value) return;
	await misskeyApi('notes/polls/refresh', {
		noteId: props.noteId,
	// Sadly due to being in the same component and the poll being a prop we require to break Vue's recommendation of not mutating the prop to update it.
	// eslint-disable-next-line vue/no-mutating-props
	}).then((res: any) => res.poll ? props.poll.choices = res.poll.choices : null );
};
</script>

<style lang="scss" module>
.choices {
	display: block;
	margin: 0;
	padding: 0;
	list-style: none;
}

.choice {
	display: block;
	position: relative;
	margin: 4px 0;
	padding: 4px;
	//border: solid 0.5px var(--MI_THEME-divider);
	background: var(--MI_THEME-accentedBg);
	border-radius: var(--MI-radius-xs);
	overflow: clip;
	cursor: pointer;
}

.bg {
	position: absolute;
	top: 0;
	left: 0;
	height: 100%;
	background: var(--MI_THEME-accent);
	background: linear-gradient(90deg,var(--MI_THEME-buttonGradateA),var(--MI_THEME-buttonGradateB));
	transition: width 1s ease;
}

.fg {
	position: relative;
	display: inline-block;
	padding: 3px 5px;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius-xs);
}

.info {
	color: var(--MI_THEME-fg);
}

.done {
	.choice {
		cursor: default;
	}
}
</style>
