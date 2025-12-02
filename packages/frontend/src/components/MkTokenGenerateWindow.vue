<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="500"
	:height="600"
	:withOkButton="true"
	:okButtonDisabled="false"
	:canClose="false"
	@close="dialog?.close()"
	@closed="emit('closed')"
	@ok="ok()"
>
	<template #header>{{ title || i18n.ts.generateAccessToken }}</template>

	<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
		<div class="_gaps_m">
			<div v-if="information">
				<MkInfo warn>{{ information }}</MkInfo>
			</div>
			<div>
				<MkInput v-model="name">
					<template #label>{{ i18n.ts.name }}</template>
					<template #caption>{{ i18n.ts.accessTokenNameDescription }}</template>
				</MkInput>
			</div>

			<MkSelect v-if="$i?.isAdmin" v-model="rank">
				<template #label>{{ i18n.ts.overrideRank }}</template>
				<template #caption>{{ i18n.ts.overrideRankDescription }}</template>

				<option value="admin">{{ i18n.ts._ranks.admin }}</option>
				<option value="mod">{{ i18n.ts._ranks.mod }}</option>
				<option value="user">{{ i18n.ts._ranks.user }}</option>
			</MkSelect>

			<MkSelect v-else v-model="rank">
				<template #label>{{ i18n.ts.overrideRank }}</template>
				<template #caption>{{ i18n.ts.overrideRankDescription }}</template>

				<option value="mod">{{ i18n.ts._ranks.mod }}</option>
				<option value="user">{{ i18n.ts._ranks.user }}</option>
			</MkSelect>

			<MkFolder v-if="withSharedAccess !== false" :defaultOpen="withSharedAccess === true">
				<template #label>{{ i18n.ts.sharedAccess }}</template>
				<template #suffix>{{ grantees.length || i18n.ts.none }}</template>

				<div class="_gaps_s">
					<div>{{ i18n.ts.sharedAccessDescription }}</div>

					<MkButton primary @click="addGrantee">
						<i class="ti ti-plus"></i> {{ i18n.ts.addGrantee }}
					</MkButton>

					<div v-for="(grantee, i) of grantees" :key="grantee.id" :class="$style.grantee">
						<MkUserCardMini :user="grantee" :withChart="false"/>
						<button v-tooltip="i18n.ts.removeGrantee" class="_textButton" @click="() => removeGrantee(i)"><i class="ti ti-x"></i></button>
					</div>
				</div>
			</MkFolder>

			<MkFolder>
				<template #label>{{ i18n.ts.permission }}</template>
				<template #suffix>{{ permsCount || i18n.ts.none }}</template>

				<div class="_gaps">
					<div>{{ i18n.ts.permissionsDescription }}</div>

					<div class="_gaps_s">
						<MkSwitch v-model="enableAllRead">{{ i18n.ts.enableAllRead }}</MkSwitch>
						<MkSwitch v-model="enableAllWrite">{{ i18n.ts.enableAllWrite }}</MkSwitch>
					</div>

					<div :class="$style.divider"></div>

					<div class="_gaps_s">
						<MkSwitch v-for="kind in Object.keys(permissionSwitches)" :key="kind" v-model="permissionSwitches[kind]">{{ i18n.ts._permissions[kind] }}</MkSwitch>
					</div>
				</div>
			</MkFolder>

			<MkFolder v-if="iAmAdmin || iAmModerator">
				<template #label>{{ i18n.ts.adminPermission }}</template>
				<template #suffix>{{ adminPermsCount || i18n.ts.none }}</template>

				<div class="_gaps">
					<div>{{ i18n.ts.adminPermissionsDescription }}</div>

					<div class="_gaps_s">
						<MkSwitch v-model="enableAllReadAdmin" :disabled="rank === 'user'">{{ i18n.ts.enableAllRead }}</MkSwitch>
						<MkSwitch v-model="enableAllWriteAdmin" :disabled="rank === 'user'">{{ i18n.ts.enableAllWrite }}</MkSwitch>
					</div>

					<div :class="$style.divider"></div>

					<div class="_gaps_s">
						<MkSwitch
							v-for="kind in Object.keys(permissionSwitchesForAdmin)"
							:key="kind"
							v-model="permissionSwitchesForAdmin[kind]"
							:disabled="rank === 'user'"
						>
							{{ i18n.ts._permissions[kind] }}
						</MkSwitch>
					</div>
				</div>
			</MkFolder>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { useTemplateRef, ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkInput from './MkInput.vue';
import MkSwitch from './MkSwitch.vue';
import MkButton from './MkButton.vue';
import MkInfo from './MkInfo.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import { i18n } from '@/i18n.js';
import { $i, iAmAdmin, iAmModerator } from '@/i.js';
import MkFolder from '@/components/MkFolder.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkSelect from '@/components/MkSelect.vue';
import * as os from '@/os.js';

const props = withDefaults(defineProps<{
	title?: string | null;
	information?: string | null;
	initialName?: string | null;
	initialPermissions?: (typeof Misskey.permissions)[number][] | null;
	withSharedAccess?: boolean | null;
}>(), {
	title: null,
	information: null,
	initialName: null,
	initialPermissions: null,
	withSharedAccess: null,
});

const emit = defineEmits<{
	(ev: 'closed'): void;
	(ev: 'done', result: { name: string | null, permissions: string[], grantees: string[], rank: string }): void;
}>();

const defaultPermissions = Misskey.permissions.filter(p => !p.startsWith('read:admin') && !p.startsWith('write:admin'));
const defaultReadPermissions = defaultPermissions.filter(p => p.startsWith('read:'));
const defaultWritePermissions = defaultPermissions.filter(p => p.startsWith('write:'));

const adminPermissions = Misskey.permissions.filter(p => p.startsWith('read:admin') || p.startsWith('write:admin'));
const adminReadPermissions = adminPermissions.filter(p => p.startsWith('read:'));
const adminWritePermissions = adminPermissions.filter(p => p.startsWith('write:'));

const dialog = useTemplateRef('dialog');
const name = ref(props.initialName);
const permissionSwitches = ref({} as Record<(typeof Misskey.permissions)[number], boolean>);
const permissionSwitchesForAdmin = ref({} as Record<(typeof Misskey.permissions)[number], boolean>);
const grantees = ref<Misskey.entities.User[]>([]);
const rank = ref<'admin' | 'mod' | 'user'>(
	$i?.isAdmin
		? 'admin'
		: $i?.isModerator
			? 'mod'
			: 'user');
const permsCount = computed(() => Object.values(permissionSwitches.value).reduce((sum, active) => active ? sum + 1 : sum, 0));
const adminPermsCount = computed(() => Object.values(permissionSwitchesForAdmin.value).reduce((sum, active) => active ? sum + 1 : sum, 0));

if (props.initialPermissions) {
	for (const kind of props.initialPermissions) {
		permissionSwitches.value[kind] = true;
	}
} else {
	for (const kind of defaultPermissions) {
		permissionSwitches.value[kind] = false;
	}

	if (iAmAdmin) {
		for (const kind of adminPermissions) {
			permissionSwitchesForAdmin.value[kind] = false;
		}
	}
}

const enableAllRead = computed({
	get() {
		return defaultReadPermissions.every(p => permissionSwitches.value[p]);
	},
	set(value: boolean) {
		defaultReadPermissions.forEach(p => permissionSwitches.value[p] = value);
	},
});

const enableAllWrite = computed({
	get() {
		return defaultWritePermissions.every(p => permissionSwitches.value[p]);
	},
	set(value: boolean) {
		defaultWritePermissions.forEach(p => permissionSwitches.value[p] = value);
	},
});

const enableAllReadAdmin = computed({
	get() {
		return adminReadPermissions.every(p => permissionSwitchesForAdmin.value[p]);
	},
	set(value: boolean) {
		adminReadPermissions.forEach(p => permissionSwitchesForAdmin.value[p] = value);
	},
});

const enableAllWriteAdmin = computed({
	get() {
		return adminWritePermissions.every(p => permissionSwitchesForAdmin.value[p]);
	},
	set(value: boolean) {
		adminWritePermissions.forEach(p => permissionSwitchesForAdmin.value[p] = value);
	},
});

async function ok(): Promise<void> {
	if (props.withSharedAccess === true && grantees.value.length < 1) {
		await os.alert({
			type: 'warning',
			title: i18n.ts.grantSharedAccessNoSelection,
			text: i18n.ts.grantSharedAccessNoSelection2,
		});
		return;
	}

	if (!Object.values(permissionSwitches.value).some(v => v) && !Object.values(permissionSwitchesForAdmin.value).some(v => v)) {
		const { canceled } = await os.confirm({
			type: 'question',
			okText: i18n.ts.yes,
			cancelText: i18n.ts.no,
			text: i18n.ts.tokenHasNoPermissionsConfirm,
		});

		if (canceled) return;
	}

	emit('done', {
		name: name.value,
		permissions: [
			...Object.keys(permissionSwitches.value).filter(p => permissionSwitches.value[p]),
			...((iAmAdmin && rank.value === 'admin') ? Object.keys(permissionSwitchesForAdmin.value).filter(p => permissionSwitchesForAdmin.value[p]) : []),
		],
		grantees: grantees.value.map(g => g.id),
		rank: rank.value,
	});
	dialog.value?.close();
}

async function addGrantee(): Promise<void> {
	const user = await os.selectUser({
		localOnly: true,
	});
	grantees.value.push(user);
}

function removeGrantee(index: number) {
	grantees.value.splice(index, 1);
}
</script>

<style module lang="scss">
.adminPermissions {
	margin: 8px -6px 0;
	padding: 24px 6px 6px;
	border: 2px solid var(--MI_THEME-error);
	border-radius: calc(var(--MI-radius) / 2);
}

.adminPermissionsHeader {
	margin: -34px 0 6px 12px;
	padding: 0 4px;
	width: fit-content;
	color: var(--MI_THEME-error);
	background: var(--MI_THEME-panel);
}

.grantee {
	display: flex;
	flex-direction: row;
	align-items: flex-start;
	gap: var(--MI-marginHalf);
}

.grantee > :first-child {
	flex: 1;
}

.divider {
	border-bottom: 1px solid var(--MI_THEME-divider);
}
</style>
