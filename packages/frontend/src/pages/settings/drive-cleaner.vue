<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkSelect v-model="sortModeSelect">
		<template #label>{{ i18n.ts.sort }}</template>
		<option v-for="x in sortOptions" :key="x.value" :value="x.value">{{ x.displayName }}</option>
	</MkSelect>
	<div v-if="!fetching">
		<MkPagination v-slot="{items}" ref="paginationComponent" :pagination="pagination">
			<div class="_gaps">
				<div
					v-for="file in items" :key="file.id"
					class="_button"
					@click="$event => onClick($event, file)"
					@contextmenu.stop="$event => onContextMenu($event, file)"
				>
					<div :class="$style.file">
						<div v-if="file.isSensitive" class="sensitive-label">{{ i18n.ts.sensitive }}</div>
						<MkDriveFileThumbnail :class="$style.fileThumbnail" :file="file" fit="contain"/>
						<div :class="$style.fileBody">
							<div style="margin-bottom: 4px;">
								{{ file.name }}
							</div>
							<div>
								<span style="margin-right: 1em;">{{ file.type }}</span>
								<span>{{ bytes(file.size) }}</span>
							</div>
							<div>
								<span>{{ i18n.ts.createdAt }}: <MkTime :time="file.createdAt" mode="detail"/></span>
							</div>
							<div v-if="sortModeSelect === 'sizeDesc'">
								<div :class="$style.meter"><div :class="$style.meterValue" :style="genUsageBar(file.size)"></div></div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</MkPagination>
	</div>
	<div v-else>
		<MkLoading/>
	</div>
</div>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue';
import type { StyleValue } from 'vue';
import tinycolor from 'tinycolor2';
import * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkPagination from '@/components/MkPagination.vue';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import { i18n } from '@/i18n.js';
import bytes from '@/filters/bytes.js';
import { definePage } from '@/page.js';
import MkSelect from '@/components/MkSelect.vue';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';

const paginationComponent = useTemplateRef<InstanceType<typeof MkPagination>>('paginationComponent');

const sortMode = ref('+size');
const pagination = {
	endpoint: 'drive/files' as const,
	limit: 10,
	params: computed(() => ({ sort: sortMode.value, showAll: true })),
	offsetMode: true,
};

const sortOptions = [
	{ value: 'sizeDesc', displayName: i18n.ts._drivecleaner.orderBySizeDesc },
	{ value: 'createdAtAsc', displayName: i18n.ts._drivecleaner.orderByCreatedAtAsc },
];

const capacity = ref<number>(0);
const usage = ref<number>(0);
const fetching = ref(true);
const sortModeSelect = ref('sizeDesc');

fetchDriveInfo();

watch(sortModeSelect, () => {
	switch (sortModeSelect.value) {
		case 'sizeDesc':
			sortMode.value = '+size';
			fetchDriveInfo();
			break;

		case 'createdAtAsc':
			sortMode.value = '-createdAt';
			fetchDriveInfo();
			break;
	}
});

function fetchDriveInfo(): void {
	fetching.value = true;
	misskeyApi('drive').then(info => {
		capacity.value = info.capacity;
		usage.value = info.usage;
		fetching.value = false;
	});
}

function genUsageBar(fsize: number): StyleValue {
	return {
		width: `${fsize / usage.value * 100}%`,
		background: tinycolor({ h: 180 - (fsize / usage.value * 180), s: 0.7, l: 0.5 }).toHslString(),
	};
}

async function deleteFile(file: Misskey.entities.DriveFile) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.driveFileDeleteConfirm({ name: file.name }),
	});

	if (canceled) return;
	misskeyApi('drive/files/delete', {
		fileId: file.id,
	});

	if (paginationComponent.value) {
		paginationComponent.value.items.delete(file.id);
	}
}

function getDriveFileMenu(file: Misskey.entities.DriveFile): MenuItem[] {
	const menuItems: MenuItem[] = [];

	menuItems.push({
		text: i18n.ts.copyUrl,
		icon: 'ti ti-link',
		action: () => copyToClipboard(file.url),
	}, {
		type: 'a',
		href: file.url,
		target: '_blank',
		text: i18n.ts.download,
		icon: 'ti ti-download',
		download: file.name,
	}, { type: 'divider' }, {
		text: i18n.ts.delete,
		icon: 'ti ti-trash',
		danger: true,
		action: () => deleteFile(file),
	});

	return menuItems;
}

function onClick(ev: MouseEvent, file) {
	os.popupMenu(getDriveFileMenu(file), (ev.currentTarget ?? ev.target ?? undefined) as HTMLElement | undefined);
}

function onContextMenu(ev: MouseEvent, file): void {
	os.contextMenu(getDriveFileMenu(file), ev);
}

definePage(() => ({
	title: i18n.ts.drivecleaner,
	icon: 'ti ti-trash',
}));
</script>

<style lang="scss" module>
.file {
	display: flex;
	width: 100%;
	box-sizing: border-box;
	text-align: left;
	align-items: center;

	&:hover {
		color: var(--MI_THEME-accent);
	}
}

.fileThumbnail {
	width: 100px;
	height: 100px;
}

.fileBody {
	margin-left: 0.3em;
	padding: 8px;
	flex: 1;
}

.meter {
	margin-top: 8px;
	height: 12px;
	background: rgba(0, 0, 0, 0.1);
	overflow: clip;
	border-radius: var(--MI-radius-ellipse);
}

.meterValue {
	height: 100%;
}
</style>
