<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px;">
		<div class="_gaps">
			<div class="inputs" style="display: flex; gap: var(--MI-margin); flex-wrap: wrap;">
				<MkSelect v-model="origin" style="margin: 0; flex: 1;">
					<template #label>{{ i18n.ts.instance }}</template>
					<option value="combined">{{ i18n.ts.all }}</option>
					<option value="local">{{ i18n.ts.local }}</option>
					<option value="remote">{{ i18n.ts.remote }}</option>
				</MkSelect>
				<MkInput v-model="searchHost" :debounce="true" type="search" style="margin: 0; flex: 1;" :disabled="pagination.params.origin === 'local'">
					<template #label>{{ i18n.ts.host }}</template>
				</MkInput>
			</div>
			<div class="inputs" style="display: flex; gap: var(--MI-margin); flex-wrap: wrap;">
				<MkInput v-model="userId" :debounce="true" type="search" style="margin: 0; flex: 1;">
					<template #label>User ID</template>
				</MkInput>
				<MkInput v-model="type" :debounce="true" type="search" style="margin: 0; flex: 1;">
					<template #label>MIME type</template>
				</MkInput>
			</div>
			<MkFileListForAdmin :pagination="pagination" :viewMode="viewMode"/>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkFileListForAdmin from '@/components/MkFileListForAdmin.vue';
import * as os from '@/os.js';
import { lookupFile } from '@/utility/admin-lookup.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

const origin = ref('local');
const type = ref<string | null>(null);
const searchHost = ref('');
const userId = ref('');
const viewMode = ref('grid');
const pagination = {
	endpoint: 'admin/drive/files' as const,
	limit: 10,
	params: computed(() => ({
		type: (type.value && type.value !== '') ? type.value : null,
		userId: (userId.value && userId.value !== '') ? userId.value : null,
		origin: origin.value,
		hostname: (searchHost.value && searchHost.value !== '') ? searchHost.value : null,
	})),
};

async function clear() {
	const { canceled, result } = await os.form(i18n.ts.clearCachedFilesOptions.title, {
		olderThanEnum: {
			label: i18n.ts.clearCachedFilesOptions.olderThan,
			type: 'enum',
			default: 'now',
			required: true,
			enum: [
				{ label: i18n.ts.clearCachedFilesOptions.now, value: 'now' },
				{ label: i18n.ts.clearCachedFilesOptions.oneWeek, value: 'oneWeek' },
				{ label: i18n.ts.clearCachedFilesOptions.oneMonth, value: 'oneMonth' },
				{ label: i18n.ts.clearCachedFilesOptions.oneYear, value: 'oneYear' },
			],
		},
		keepFilesInUse: {
			label: i18n.ts.clearCachedFilesOptions.keepFilesInUse,
			description: i18n.ts.clearCachedFilesOptions.keepFilesInUseDescription,
			type: 'boolean',
			default: false,
		},
	});

	if (canceled) return;

	const timesMap = {
		now: 0,
		oneWeek: 7 * 86400,
		oneMonth: 30 * 86400,
		oneYear: 365 * 86400,
	};

	await os.apiWithDialog('admin/drive/clean-remote-files', {
		olderThanSeconds: timesMap[result.olderThanEnum] ?? 0,
		keepFilesInUse: result.keepFilesInUse,
	});
}

const headerActions = computed(() => [{
	text: i18n.ts.lookup,
	icon: 'ti ti-search',
	handler: lookupFile,
}, {
	text: i18n.ts.clearCachedFiles,
	icon: 'ti ti-trash',
	handler: clear,
}]);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.files,
	icon: 'ti ti-cloud',
}));
</script>
