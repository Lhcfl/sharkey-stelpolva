<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 1000px;">
	<div ref="rootEl" :class="$style.root">
		<MkFoldableSection class="item">
			<template #header>Stats</template>
			<XStats/>
		</MkFoldableSection>

		<MkFoldableSection class="item">
			<template #header>Active users</template>
			<XActiveUsers/>
		</MkFoldableSection>

		<MkFoldableSection class="item">
			<template #header>Heatmap</template>
			<XHeatmap/>
		</MkFoldableSection>

		<MkFoldableSection class="item">
			<template #header>Retention rate</template>
			<XRetention/>
		</MkFoldableSection>

		<MkFoldableSection class="item">
			<template #header>Moderators</template>
			<XModerators/>
		</MkFoldableSection>

		<MkFoldableSection class="item">
			<template #header>Federation</template>
			<XFederation/>
		</MkFoldableSection>

		<MkFoldableSection class="item">
			<template #header>Instances</template>
			<XInstances/>
		</MkFoldableSection>

		<MkFoldableSection class="item">
			<template #header>Ap requests</template>
			<XApRequests/>
		</MkFoldableSection>

		<MkFoldableSection class="item">
			<template #header>New users</template>
			<XUsers/>
		</MkFoldableSection>

		<MkFoldableSection class="item">
			<template #header>Deliver queue</template>
			<XQueue domain="deliver"/>
		</MkFoldableSection>

		<MkFoldableSection class="item">
			<template #header>Inbox queue</template>
			<XQueue domain="inbox"/>
		</MkFoldableSection>

		<MkFoldableSection class="item">
			<template #header>{{ i18n.ts.backgroundQueue }}</template>
			<XQueue domain="background"/>
		</MkFoldableSection>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import XFederation from './overview.federation.vue';
import XInstances from './overview.instances.vue';
import XQueue from './overview.queue.vue';
import XApRequests from './overview.ap-requests.vue';
import XUsers from './overview.users.vue';
import XActiveUsers from './overview.active-users.vue';
import XStats from './overview.stats.vue';
import XRetention from './overview.retention.vue';
import XModerators from './overview.moderators.vue';
import XHeatmap from './overview.heatmap.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkFoldableSection from '@/components/MkFoldableSection.vue';

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.dashboard,
	icon: 'ti ti-dashboard',
}));
</script>

<style lang="scss" module>
.root {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
	grid-gap: 16px;
}
</style>
