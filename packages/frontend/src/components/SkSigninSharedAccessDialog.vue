<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="modal"
	:width="500"
	:height="600"
	:withOkButton="false"
	:canClose="true"
	@close="onClose"
	@closed="emit('closed')"
>
	<template #header>{{ i18n.ts.loginWithSharedAccess }}</template>

	<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
		<MkPagination ref="pagingComponent" :pagination="pagination">
			<template #empty><MkResult type="empty" :text="i18n.ts.noNotes"/></template>

			<template #default="{ items }">
				<div class="_gaps">
					<div v-for="(grant, i) of items" :key="grant.id" :class="$style.grant">
						<MkUserCardMini :user="grant.user" :withChart="false" :class="$style.user"/>
						<div class="_gaps_s">
							<button v-tooltip="i18n.ts.login" class="_textButton" @click="onLogin(grant.id)"><i class="ph-sign-in ph-bold ph-lg"></i></button>
							<button v-if="isExpanded(i)" v-tooltip="i18n.ts.collapse" class="_textButton" @click="collapse(i)"><i class="ph-caret-up ph-bold ph-lg"></i></button>
							<button v-else v-tooltip="i18n.ts.expand" class="_textButton" @click="expand(i)"><i class="ph-caret-down ph-bold ph-lg"></i></button>
						</div>
						<div v-if="isExpanded(i)" :class="$style.perms">
							<span>{{ i18n.ts.permissions }}:</span>
							<ul>
								<li v-for="perm of grant.permissions" :key="perm">{{ i18n.ts._permissions[perm] ?? perm }}</li>
							</ul>
						</div>
					</div>
				</div>
			</template>
		</MkPagination>
	</div>
</MkModalWindow>
</template>

<script setup lang="ts">

import { computed, ref, useTemplateRef } from 'vue';
import type { Paging } from '@/components/MkPagination.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';

const emit = defineEmits<{
	(ev: 'done', v: { id: string, i: string }): void;
	(ev: 'closed'): void;
	(ev: 'cancelled'): void;
}>();

const pagination = computed(() => ({
	endpoint: 'i/shared-access/list',
	params: {},
	limit: 10,
} satisfies Paging));

const modal = useTemplateRef('modal');
const expandedIds = ref(new Set<number>());

function isExpanded(i: number) {
	return expandedIds.value.has(i);
}

function expand(i: number) {
	expandedIds.value.add(i);
}

function collapse(i: number) {
	expandedIds.value.delete(i);
}

async function onLogin(grantId: string) {
	const { userId, token } = await os.apiWithDialog('i/shared-access/login', { grantId });
	if (modal.value) modal.value.close();
	emit('done', { id: userId, i: token });
}

function onClose() {
	if (modal.value) modal.value.close();
	emit('cancelled');
}
</script>

<style module lang="scss">
.grant {
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--MI-marginHalf);

	flex: 1;
}

.user {
	flex: 1;
}

.perms {
	width: 100%;
	padding: var(--MI-marginHalf);
	padding-top: 0;
}

.perms > ul {
	margin: 0 0 0 1.5em;
	padding: 0;
	font-size: 90%;
}
</style>
