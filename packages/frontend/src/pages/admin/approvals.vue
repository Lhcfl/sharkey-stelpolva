<!--
SPDX-FileCopyrightText: marie and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<PageWithHeader :tabs="headerTabs">
		<div class="_spacer" style="--MI_SPACER-w: 900px;">
			<div class="_gaps_m">
				<MkPagination ref="paginationComponent" :pagination="pagination" :displayLimit="50">
					<template #default="{ items }">
						<div class="_gaps_s">
							<SkApprovalUser v-for="item in items" :key="item.id" :user="(item as any)" :onDeleted="deleted"/>
						</div>
					</template>
				</MkPagination>
			</div>
		</div>
	</PageWithHeader>
</div>
</template>

<script lang="ts" setup>
import { computed, useTemplateRef } from 'vue';
import MkPagination from '@/components/MkPagination.vue';
import SkApprovalUser from '@/components/SkApprovalUser.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page';

let paginationComponent = useTemplateRef<InstanceType<typeof MkPagination>>('paginationComponent');

const pagination = {
	endpoint: 'admin/show-users' as const,
	limit: 10,
	params: computed(() => ({
		sort: '+createdAt',
		state: 'approved',
		origin: 'local',
	})),
	offsetMode: true,
};

function deleted(id: string) {
	if (paginationComponent.value) {
		paginationComponent.value.items.delete(id);
	}
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.approvals,
	icon: 'ph-chalkboard-teacher ph-bold ph-lg',
}));
</script>

<style lang="scss" module>
.inputs {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}

.input {
	flex: 1;
}
</style>
