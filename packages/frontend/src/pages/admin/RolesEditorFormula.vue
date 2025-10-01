<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div :class="$style.header">
		<div style="display: flex; align-items: center;">
			<i v-if="results !== null && results[v.id]" class="ti ti-check" :class="$style.testResultTrue"></i>
			<i v-else-if="results !== null" class="ti ti-x" :class="$style.testResultFalse"></i>
		</div>
		<MkSelect v-model="type" :class="$style.typeSelect">
			<option value="isLocal">{{ i18n.ts._role._condition.isLocal }}</option>
			<option value="isRemote">{{ i18n.ts._role._condition.isRemote }}</option>
			<option value="isFromInstance">{{ i18n.ts._role._condition.isFromInstance }}</option>
			<option value="fromBubbleInstance">{{ i18n.ts._role._condition.fromBubbleInstance }}</option>
			<option value="isSuspended">{{ i18n.ts._role._condition.isSuspended }}</option>
			<option value="isLocked">{{ i18n.ts._role._condition.isLocked }}</option>
			<option value="isBot">{{ i18n.ts._role._condition.isBot }}</option>
			<option value="isCat">{{ i18n.ts._role._condition.isCat }}</option>
			<option value="isExplorable">{{ i18n.ts._role._condition.isExplorable }}</option>
			<option value="roleAssignedTo">{{ i18n.ts._role._condition.roleAssignedTo }}</option>
			<option value="createdLessThan">{{ i18n.ts._role._condition.createdLessThan }}</option>
			<option value="createdMoreThan">{{ i18n.ts._role._condition.createdMoreThan }}</option>
			<option value="followersLessThanOrEq">{{ i18n.ts._role._condition.followersLessThanOrEq }}</option>
			<option value="followersMoreThanOrEq">{{ i18n.ts._role._condition.followersMoreThanOrEq }}</option>
			<option value="followingLessThanOrEq">{{ i18n.ts._role._condition.followingLessThanOrEq }}</option>
			<option value="followingMoreThanOrEq">{{ i18n.ts._role._condition.followingMoreThanOrEq }}</option>
			<option value="localFollowersLessThanOrEq">{{ i18n.ts._role._condition.localFollowersLessThanOrEq }}</option>
			<option value="localFollowersMoreThanOrEq">{{ i18n.ts._role._condition.localFollowersMoreThanOrEq }}</option>
			<option value="localFollowingLessThanOrEq">{{ i18n.ts._role._condition.localFollowingLessThanOrEq }}</option>
			<option value="localFollowingMoreThanOrEq">{{ i18n.ts._role._condition.localFollowingMoreThanOrEq }}</option>
			<option value="remoteFollowersLessThanOrEq">{{ i18n.ts._role._condition.remoteFollowersLessThanOrEq }}</option>
			<option value="remoteFollowersMoreThanOrEq">{{ i18n.ts._role._condition.remoteFollowersMoreThanOrEq }}</option>
			<option value="remoteFollowingLessThanOrEq">{{ i18n.ts._role._condition.remoteFollowingLessThanOrEq }}</option>
			<option value="remoteFollowingMoreThanOrEq">{{ i18n.ts._role._condition.remoteFollowingMoreThanOrEq }}</option>
			<option value="notesLessThanOrEq">{{ i18n.ts._role._condition.notesLessThanOrEq }}</option>
			<option value="notesMoreThanOrEq">{{ i18n.ts._role._condition.notesMoreThanOrEq }}</option>
			<option value="and">{{ i18n.ts._role._condition.and }}</option>
			<option value="or">{{ i18n.ts._role._condition.or }}</option>
			<option value="not">{{ i18n.ts._role._condition.not }}</option>
		</MkSelect>
		<button v-if="draggable" class="drag-handle _button" :class="$style.dragHandle">
			<i class="ti ti-menu-2"></i>
		</button>
		<button v-if="draggable" class="_button" :class="$style.remove" @click="removeSelf">
			<i class="ti ti-x"></i>
		</button>
	</div>

	<div v-if="type === 'and' || type === 'or'" class="_gaps">
		<Sortable v-model="v.values" tag="div" class="_gaps" itemKey="id" handle=".drag-handle" :group="{ name: 'roleFormula' }" :animation="150" :swapThreshold="0.5">
			<template #item="{element}">
				<div :class="$style.item">
					<!-- divが無いとエラーになる https://github.com/SortableJS/vue.draggable.next/issues/189 -->
					<RolesEditorFormula :modelValue="element" :results="results" draggable @update:modelValue="updated => valuesItemUpdated(updated)" @remove="removeItem(element)"/>
				</div>
			</template>
		</Sortable>
		<MkButton rounded style="margin: 0 auto;" @click="addValue"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>
	</div>

	<div v-else-if="type === 'not'" :class="$style.item">
		<RolesEditorFormula v-model="v.value" :results="results"/>
	</div>

	<MkInput v-else-if="type === 'createdLessThan' || type === 'createdMoreThan'" v-model="v.sec" type="number">
		<template #suffix>sec</template>
	</MkInput>

	<MkInput
		v-else-if="[
			'followersLessThanOrEq',
			'followersMoreThanOrEq',
			'followingLessThanOrEq',
			'followingMoreThanOrEq',
			'localFollowersLessThanOrEq',
			'localFollowersMoreThanOrEq',
			'localFollowingLessThanOrEq',
			'localFollowingMoreThanOrEq',
			'remoteFollowersLessThanOrEq',
			'remoteFollowersMoreThanOrEq',
			'remoteFollowingLessThanOrEq',
			'remoteFollowingMoreThanOrEq',
			'notesLessThanOrEq',
			'notesMoreThanOrEq'
		].includes(type)"
		v-model="v.value"
		type="number"
	>
	</MkInput>

	<MkSelect v-else-if="type === 'roleAssignedTo'" v-model="v.roleId">
		<option v-for="role in roles.filter(r => r.target === 'manual')" :key="role.id" :value="role.id">{{ role.name }}</option>
	</MkSelect>

	<MkInput v-else-if="type === 'isFromInstance'" v-model="v.host" type="text">
		<template #label>{{ i18n.ts._role._condition.isFromInstanceHost }}</template>
	</MkInput>

	<MkSwitch v-if="type === 'isFromInstance'" v-model="v.subdomains">
		<template #label>{{ i18n.ts._role._condition.isFromInstanceSubdomains }}</template>
	</MkSwitch>

	<div v-if="['remoteFollowersLessThanOrEq', 'remoteFollowersMoreThanOrEq', 'remoteFollowingLessThanOrEq', 'remoteFollowingMoreThanOrEq'].includes(type)" :class="$style.warningBanner">
		<i class="ti ti-alert-triangle"></i>
		{{ i18n.ts._role.remoteDataWarning }}
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { v4 as uuid } from 'uuid';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { deepClone } from '@/utility/clone.js';
import { rolesCache } from '@/cache.js';
import MkSwitch from '@/components/MkSwitch.vue';

const Sortable = defineAsyncComponent(() => import('vuedraggable').then(x => x.default));

const emit = defineEmits<{
	(ev: 'update:modelValue', value: any): void;
	(ev: 'remove'): void;
}>();

const props = defineProps<{
	modelValue: any;
	draggable?: boolean;
	results: object | null;
}>();

const v = ref(deepClone(props.modelValue));

const roles = await rolesCache.fetch();

watch(() => props.modelValue, () => {
	if (JSON.stringify(props.modelValue) === JSON.stringify(v.value)) return;
	v.value = deepClone(props.modelValue);
}, { deep: true });

watch(v, () => {
	emit('update:modelValue', v.value);
}, { deep: true });

const type = computed({
	get: () => v.value.type,
	set: (t) => {
		// TODO there's a bug here: switching types leaves extra properties in the JSON
		if (t === 'and') v.value.values = [];
		if (t === 'or') v.value.values = [];
		if (t === 'not') v.value.value = { id: uuid(), type: 'isRemote' };
		if (t === 'roleAssignedTo') v.value.roleId = '';
		if (t === 'createdLessThan') v.value.sec = 86400;
		if (t === 'createdMoreThan') v.value.sec = 86400;
		if (t === 'followersLessThanOrEq') v.value.value = 10;
		if (t === 'followersMoreThanOrEq') v.value.value = 10;
		if (t === 'followingLessThanOrEq') v.value.value = 10;
		if (t === 'followingMoreThanOrEq') v.value.value = 10;
		if (t === 'localFollowersLessThanOrEq') v.value.value = 10;
		if (t === 'localFollowersMoreThanOrEq') v.value.value = 10;
		if (t === 'localFollowingLessThanOrEq') v.value.value = 10;
		if (t === 'localFollowingMoreThanOrEq') v.value.value = 10;
		if (t === 'remoteFollowersLessThanOrEq') v.value.value = 10;
		if (t === 'remoteFollowersMoreThanOrEq') v.value.value = 10;
		if (t === 'remoteFollowingLessThanOrEq') v.value.value = 10;
		if (t === 'remoteFollowingMoreThanOrEq') v.value.value = 10;
		if (t === 'notesLessThanOrEq') v.value.value = 10;
		if (t === 'notesMoreThanOrEq') v.value.value = 10;
		if (t === 'isFromInstance') {
			v.value.host = '';
			v.value.subdomains = true;
		}
		v.value.type = t;
	},
});

function addValue() {
	v.value.values.push({ id: uuid(), type: 'isRemote' });
}

function valuesItemUpdated(item) {
	const i = v.value.values.findIndex(_item => _item.id === item.id);
	v.value.values[i] = item;
}

function removeItem(item) {
	v.value.values = v.value.values.filter(_item => _item.id !== item.id);
}

function removeSelf() {
	emit('remove');
}
</script>

<style lang="scss" module>
.header {
	display: flex;
}

.typeSelect {
	flex: 1;
}

.dragHandle {
	cursor: move;
	margin-left: 10px;
}

.remove {
	margin-left: 10px;
}

.item {
	border: solid 2px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	padding: 12px;

	&:hover {
		border-color: var(--MI_THEME-accent);
	}
}

.warningBanner {
	color: var(--MI_THEME-warn);
	width: 100%;
	padding: 0 6px;

	> i {
		margin-right: 4px;
	}
}

.testResultFalse {
	color: var(--MI_THEME-error);
	align-self: center;
	margin-right: 10px;
}

.testResultTrue {
	color: var(--MI_THEME-success);
	align-self: center;
	margin-right: 10px;
}
</style>
