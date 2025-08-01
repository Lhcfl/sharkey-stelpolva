<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon>
		<i v-if="report.resolved && report.resolvedAs === 'accept'" class="ti ti-check" style="color: var(--MI_THEME-success)"></i>
		<i v-else-if="report.resolved && report.resolvedAs === 'reject'" class="ti ti-x" style="color: var(--MI_THEME-error)"></i>
		<i v-else-if="report.resolved" class="ti ti-slash"></i>
		<i v-else class="ti ti-exclamation-circle" style="color: var(--MI_THEME-warn)"></i>
	</template>
	<template #label><MkAcct :user="report.targetUser"/> (by <MkAcct :user="report.reporter"/>)</template>
	<template #caption>{{ report.comment }}</template>
	<template #suffix><MkTime :time="report.createdAt"/></template>
	<template #footer>
		<div class="_buttons">
			<template v-if="!report.resolved">
				<MkButton @click="resolve('accept')"><i class="ti ti-check" style="color: var(--MI_THEME-success)"></i> {{ i18n.ts._abuseUserReport.resolve }} ({{ i18n.ts._abuseUserReport.accept }})</MkButton>
				<MkButton @click="resolve('reject')"><i class="ti ti-x" style="color: var(--MI_THEME-error)"></i> {{ i18n.ts._abuseUserReport.resolve }} ({{ i18n.ts._abuseUserReport.reject }})</MkButton>
				<MkButton @click="resolve(null)"><i class="ti ti-slash"></i> {{ i18n.ts._abuseUserReport.resolve }} ({{ i18n.ts.other }})</MkButton>
			</template>
			<template v-if="report.targetUser.host != null">
				<MkButton :disabled="report.forwarded" primary @click="forward"><i class="ti ti-corner-up-right"></i> {{ i18n.ts._abuseUserReport.forward }}</MkButton>
				<div v-tooltip:dialog="i18n.ts._abuseUserReport.forwardDescription" class="_button _help"><i class="ti ti-help-circle"></i></div>
			</template>
			<button class="_button" style="margin-left: auto; width: 34px;" @click="showMenu"><i class="ti ti-dots"></i></button>
		</div>
	</template>

	<div class="_gaps_s">
		<MkFolder :withSpacer="false">
			<template #icon><MkAvatar :user="report.targetUser" style="width: 18px; height: 18px;"/></template>
			<template #label>{{ i18n.ts.target }}: <MkAcct :user="report.targetUser"/></template>
			<template #suffix>{{ i18n.ts.id }}# {{ report.targetUserId }}</template>

			<div style="--MI-stickyTop: 0; --MI-stickyBottom: 0;">
				<admin-user :userId="report.targetUserId" :userHint="report.targetUser"></admin-user>
			</div>
		</MkFolder>

		<MkFolder v-if="report.targetInstance" :withSpacer="false">
			<template #icon>
				<img
					v-if="targetInstanceIcon"
					:src="targetInstanceIcon"
					:alt="i18n.tsx.instanceIconAlt({ name: report.targetInstance.name || report.targetInstance.host })"
					:class="$style.instanceIcon"
					class="icon"
				/>
			</template>
			<template #label>{{ i18n.ts.instance }}: {{ report.targetInstance.name || report.targetInstance.host }}</template>
			<template #suffix>{{ i18n.ts.id }}# {{ report.targetInstance.id }}</template>

			<div style="--MI-stickyTop: 0; --MI-stickyBottom: 0;">
				<instance-info :host="report.targetInstance.host" :instanceHint="report.targetInstance" :metaHint="metaHint"></instance-info>
			</div>
		</MkFolder>

		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-message-2"></i></template>
			<template #label>{{ i18n.ts.details }}</template>
			<div class="_gaps_s">
				<Mfm :text="report.comment" :parsedNodes="parsedComment" :isBlock="true" :linkNavigationBehavior="'window'" :author="report.reporter" :nyaize="false" :isAnim="false"/>
				<div class="_gaps_s" @click.stop>
					<SkUrlPreviewGroup :sourceNodes="parsedComment" :compact="false" :detail="false" :showAsQuote="true"/>
				</div>
			</div>
		</MkFolder>

		<MkFolder :withSpacer="false">
			<template #icon><MkAvatar :user="report.reporter" style="width: 18px; height: 18px;"/></template>
			<template #label>{{ i18n.ts.reporter }}: <MkAcct :user="report.reporter"/></template>
			<template #suffix>{{ i18n.ts.id }}# {{ report.reporterId }}</template>

			<div style="--MI-stickyTop: 0; --MI-stickyBottom: 0;">
				<admin-user :userId="report.reporterId" :userHint="report.reporter"></admin-user>
			</div>
		</MkFolder>

		<MkFolder :defaultOpen="false">
			<template #icon><i class="ti ti-message-2"></i></template>
			<template #label>{{ i18n.ts.staffNotes }}</template>
			<template #suffix>{{ moderationNote.length > 0 ? '...' : i18n.ts.none }}</template>
			<div class="_gaps_s">
				<MkTextarea v-model="moderationNote" manualSave>
					<template #caption>{{ i18n.ts.moderationNoteDescription }}</template>
				</MkTextarea>
			</div>
		</MkFolder>

		<div v-if="report.assignee">
			{{ i18n.ts.moderator }}:
			<MkAcct :user="report.assignee"/>
		</div>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { computed, provide, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import * as mfm from 'mfm-js';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { dateString } from '@/filters/date.js';
import MkFolder from '@/components/MkFolder.vue';
import RouterView from '@/components/global/RouterView.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { createRouter } from '@/router.js';
import { getProxiedImageUrlNullable } from '@/utility/media-proxy';
import InstanceInfo from '@/pages/instance-info.vue';
import { iAmAdmin } from '@/i';
import { misskeyApi } from '@/utility/misskey-api';
import AdminUser from '@/pages/admin-user.vue';
import SkUrlPreviewGroup from '@/components/SkUrlPreviewGroup.vue';

const props = withDefaults(defineProps<{
	report: Misskey.entities.AdminAbuseUserReportsResponse[number];
	metaHint?: Misskey.entities.AdminMetaResponse | undefined;
}>(), {
	metaHint: undefined,
});

const emit = defineEmits<{
	(ev: 'resolved', reportId: string): void;
}>();

/*
const targetRouter = createRouter(`/admin/user/${props.report.targetUserId}`);
targetRouter.init();
const reporterRouter = createRouter(`/admin/user/${props.report.reporterId}`);
reporterRouter.init();
*/

const parsedComment = computed(() => mfm.parse(props.report.comment));

const targetInstanceIcon = computed(() => props.report.targetInstance?.faviconUrl
	? getProxiedImageUrlNullable(props.report.targetInstance.faviconUrl, 'preview')
	: props.report.targetInstance?.iconUrl
		? getProxiedImageUrlNullable(props.report.targetInstance.iconUrl, 'preview')
		: null);

const moderationNote = ref(props.report.moderationNote ?? '');

watch(moderationNote, async () => {
	os.apiWithDialog('admin/update-abuse-user-report', {
		reportId: props.report.id,
		moderationNote: moderationNote.value,
	}).then(() => {
	});
});

function resolve(resolvedAs) {
	os.apiWithDialog('admin/resolve-abuse-user-report', {
		reportId: props.report.id,
		resolvedAs,
	}).then(() => {
		emit('resolved', props.report.id);
	});
}

function forward() {
	os.apiWithDialog('admin/forward-abuse-user-report', {
		reportId: props.report.id,
	}).then(() => {

	});
}

function showMenu(ev: MouseEvent) {
	os.popupMenu([{
		icon: 'ti ti-hash',
		text: 'Copy ID',
		action: () => {
			copyToClipboard(props.report.id);
		},
	}, {
		icon: 'ti ti-json',
		text: 'Copy JSON',
		action: () => {
			copyToClipboard(JSON.stringify(props.report, null, '\t'));
		},
	}], ev.currentTarget ?? ev.target);
}
</script>

<style lang="scss" module>
.instanceIcon {
	width: 18px;
	height: 18px;
}
</style>
