<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<FormPagination ref="list" :pagination="pagination">
		<template #empty><MkResult type="empty"/></template>
		<template #default="{items}">
			<div class="_gaps">
				<MkFolder v-for="token in items" :key="token.id" :defaultOpen="true">
					<template #icon>
						<img v-if="token.iconUrl" :class="$style.appIcon" :src="token.iconUrl" alt=""/>
						<i v-else class="ti ti-plug"/>
					</template>
					<template #label>{{ token.name }}</template>
					<template #caption>{{ token.description }}</template>
					<template #suffix><MkTime :time="token.lastUsedAt"/></template>
					<template #footer>
						<MkButton danger @click="revoke(token)"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
					</template>

					<div class="_gaps_s">
						<div v-if="token.description">{{ token.description }}</div>
						<div>
							<MkKeyValue oneline>
								<template #key>{{ i18n.ts.installedDate }}</template>
								<template #value><MkTime :time="token.createdAt" :mode="'detail'"/></template>
							</MkKeyValue>
							<MkKeyValue oneline>
								<template #key>{{ i18n.ts.lastUsedDate }}</template>
								<template #value><MkTime :time="token.lastUsedAt" :mode="'detail'"/></template>
							</MkKeyValue>
							<MkKeyValue v-if="token.rank" oneline>
								<template #key>{{ i18n.ts.rank }}</template>
								<template #value>{{ i18n.ts._ranks[token.rank ?? 'default'] ?? token.rank }}</template>
							</MkKeyValue>
						</div>
						<MkFolder v-if="token.grantees.length > 0" :defaultOpen="onlySharedAccess">
							<template #label>{{ i18n.ts.sharedAccess }}</template>
							<template #suffix>{{ token.grantees.length }}</template>

							<MkUserCardMini v-for="grantee of token.grantees" :key="grantee.id" :user="grantee" :withChart="true" :withLink="true"/>
						</MkFolder>
						<MkFolder v-if="standardPerms(token.permission).length > 0">
							<template #label>{{ i18n.ts.permission }}</template>
							<template #suffix>{{ standardPerms(token.permission).length }}</template>
							<ul>
								<li v-for="p of standardPerms(token.permission)" :key="p">{{ i18n.ts._permissions[p] }}</li>
							</ul>
						</MkFolder>
						<MkFolder v-if="adminPerms(token.permission).length > 0">
							<template #label>{{ i18n.ts.adminPermission }}</template>
							<template #suffix>{{ adminPerms(token.permission).length }}</template>
							<ul>
								<li v-for="p of adminPerms(token.permission)" :key="p">{{ i18n.ts._permissions[p] }}</li>
							</ul>
						</MkFolder>
					</div>
				</MkFolder>
			</div>
		</template>
	</FormPagination>
</div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import * as os from '@/os.js';
import FormPagination from '@/components/MkPagination.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkKeyValue from '@/components/MkKeyValue.vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';

const list = ref<InstanceType<typeof FormPagination>>();

const props = withDefaults(defineProps<{
	onlySharedAccess?: boolean,
	limit?: number,
}>(), {
	onlySharedAccess: false,
	limit: 100,
});

const pagination = computed(() => ({
	endpoint: 'i/apps' as const,
	limit: props.limit,
	params: {
		sort: '+lastUsedAt',
		onlySharedAccess: props.onlySharedAccess,
	},
}));

async function revoke(token: Misskey.entities.IAppsResponse[number]) {
	const { canceled } = await os.confirm({
		type: 'question',
		text: token.grantees.length > 0
			? i18n.tsx.confirmRevokeSharedToken({ num: token.grantees.length })
			: i18n.ts.confirmRevokeToken,
		okText: i18n.ts.yes,
		cancelText: i18n.ts.no,
	});
	if (canceled) return;

	await os.promiseDialog(async () => {
		await misskeyApi('i/revoke-token', { tokenId: token.id });

		await list.value?.reload();
	});
}

function isAdmin(perm: string): boolean {
	return perm.startsWith('read:admin') || perm.startsWith('write:admin');
}

function standardPerms(perms: string[]): string[] {
	return perms.filter(perm => !isAdmin(perm));
}

function adminPerms(perms: string[]): string[] {
	return perms.filter(perm => isAdmin(perm));
}

defineExpose({
	reload: () => list.value?.reload(),
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.installedApps,
	icon: 'ti ti-plug',
}));
</script>

<style lang="scss" module>
.appIcon {
	width: 20px;
	height: 20px;
	border-radius: 4px;
}
</style>
