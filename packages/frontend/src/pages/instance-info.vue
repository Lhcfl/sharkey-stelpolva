<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs" :spacer="true" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
	<div v-if="instance">
		<!-- This empty div is preserved to avoid merge conflicts -->
		<div>
			<div v-if="tab === 'overview'" class="_gaps">
				<div class="fnfelxur">
					<!-- TODO copy the alt text stuff from reports UI PR -->
					<img v-if="faviconUrl" :src="faviconUrl" alt="" class="icon"/>
					<div :class="$style.headerData">
						<span class="name">{{ instance.name || instance.host }}</span>
						<span>
							<span class="_monospace">{{ instance.host }}</span>
							<button v-tooltip="i18n.ts.copy" class="_textButton" style="margin-left: 0.5em;" @click="copyToClipboard(instance.host)"><i class="ti ti-copy"></i></button>
						</span>
						<span>
							<span class="_monospace">{{ instance.id }}</span>
							<button v-tooltip="i18n.ts.copy" class="_textButton" style="margin-left: 0.5em;" @click="copyToClipboard(instance.id)"><i class="ti ti-copy"></i></button>
						</span>
					</div>
				</div>

				<SkBadgeStrip v-if="badges.length > 0" :badges="badges"></SkBadgeStrip>

				<MkFolder :sticky="false">
					<template #icon><i class="ph-list-bullets ph-bold ph-lg"></i></template>
					<template #label>{{ i18n.ts.details }}</template>
					<div style="display: flex; flex-direction: column; gap: 1em;">
						<MkKeyValue :copy="instance.id" oneline>
							<template #key>{{ i18n.ts.id }}</template>
							<template #value><span class="_monospace">{{ instance.id }}</span></template>
						</MkKeyValue>
						<MkKeyValue :copy="instance.name" oneline>
							<template #key>{{ i18n.ts.name }}</template>
							<template #value><span class="_monospace">{{ instance.name || `(${i18n.ts.unknown})` }}</span></template>
						</MkKeyValue>
						<MkKeyValue :copy="host" oneline>
							<template #key>{{ i18n.ts.host }}</template>
							<template #value><span class="_monospace"><MkLink :url="`https://${host}`">{{ host }}</MkLink></span></template>
						</MkKeyValue>
						<MkKeyValue :copy="instance.firstRetrievedAt" oneline>
							<template #key>{{ i18n.ts.createdAt }}</template>
							<template #value><span class="_monospace"><MkTime :time="instance.firstRetrievedAt" :mode="'detail'"/></span></template>
						</MkKeyValue>
						<MkKeyValue :copy="instance.infoUpdatedAt" oneline>
							<template #key>{{ i18n.ts.updatedAt }}</template>
							<template #value><span class="_monospace"><MkTime :time="instance.infoUpdatedAt" :mode="'detail'"/></span></template>
						</MkKeyValue>
						<MkKeyValue :copy="instance.latestRequestReceivedAt" oneline>
							<template #key>{{ i18n.ts.lastActiveDate }}</template>
							<template #value><span class="_monospace"><MkTime :time="instance.latestRequestReceivedAt" :mode="'detail'"/></span></template>
						</MkKeyValue>
						<MkKeyValue :copy="instance.softwareName" oneline>
							<template #key>{{ i18n.ts.software }}</template>
							<template #value><span class="_monospace">{{ instance.softwareName || `(${i18n.ts.unknown})` }} / {{ instance.softwareVersion || `(${i18n.ts.unknown})` }}</span></template>
						</MkKeyValue>
						<MkKeyValue :copy="instance.maintainerName" oneline>
							<template #key>{{ i18n.ts.administrator }}</template>
							<template #value><span class="_monospace">{{ instance.maintainerName || `(${i18n.ts.unknown})` }}</span></template>
						</MkKeyValue>
						<MkKeyValue :copy="instance.maintainerEmail" oneline>
							<template #key>{{ i18n.ts.email }}</template>
							<template #value><span class="_monospace">{{ instance.maintainerEmail || `(${i18n.ts.unknown})` }}</span></template>
						</MkKeyValue>
						<MkKeyValue oneline>
							<template #key>{{ i18n.ts.followingPub }}</template>
							<template #value><span class="_monospace"><MkNumber :value="instance.followingCount"/></span></template>
						</MkKeyValue>
						<MkKeyValue oneline>
							<template #key>{{ i18n.ts.followersSub }}</template>
							<template #value><span class="_monospace"><MkNumber :value="instance.followersCount"/></span></template>
						</MkKeyValue>
						<MkKeyValue oneline>
							<template #key>{{ i18n.ts._delivery.status }}</template>
							<template #value><span class="_monospace">{{ i18n.ts._delivery._type[suspensionState] }}</span></template>
						</MkKeyValue>
					</div>
				</MkFolder>

				<MkFolder :sticky="false">
					<template #label>{{ i18n.ts.wellKnownResources }}</template>
					<template #icon><i class="ph-network ph-bold ph-lg"></i></template>
					<ul :class="$style.linksList" class="_gaps_s">
						<!-- TODO more links here -->
						<li><MkLink :url="`https://${host}/.well-known/host-meta`" class="_monospace">/.well-known/host-meta</MkLink></li>
						<li><MkLink :url="`https://${host}/.well-known/host-meta.json`" class="_monospace">/.well-known/host-meta.json</MkLink></li>
						<li><MkLink :url="`https://${host}/.well-known/nodeinfo`" class="_monospace">/.well-known/nodeinfo</MkLink></li>
						<li><MkLink :url="`https://${host}/robots.txt`" class="_monospace">/robots.txt</MkLink></li>
						<li><MkLink :url="`https://${host}/manifest.json`" class="_monospace">/manifest.json</MkLink></li>
					</ul>
				</MkFolder>

				<MkFolder v-if="iAmModerator" :defaultOpen="moderationNote.length > 0" :sticky="false">
					<template #icon><i class="ph-stamp ph-bold ph-lg"></i></template>
					<template #label>{{ i18n.ts.moderationNote }}</template>
					<MkTextarea v-model="moderationNote" manualSave @update:modelValue="saveModerationNote">
						<template #label>{{ i18n.ts.moderationNote }}</template>
						<template #caption>{{ i18n.ts.moderationNoteDescription }}</template>
					</MkTextarea>
				</MkFolder>

				<FormSection v-if="instance.description">
					<template #label>{{ i18n.ts.description }}</template>
					<MkSwitch v-if="hasDescriptionHtml" v-model="enableHTMLDesctiption">HTML</MkSwitch>
					<!-- eslint-disable-next-line vue/no-v-html -->
					<div v-if="enableHTMLDesctiption" v-html="sanitizeHtml(instance.description)"></div>
					<div v-else>{{ instance.description }}</div>
				</FormSection>

				<FormSection v-if="$i">
					<template #label>{{ i18n.ts.muteAndBlock }}</template>
					<div class="_gaps_s">
						<MkSwitch v-model="isSoftMuted">{{ i18n.ts.stpvMuteInstance }}</MkSwitch>
					</div>
				</FormSection>

				<FormSection v-if="iAmModerator">
					<template #label>{{ i18n.ts.moderation }}</template>
					<div class="_gaps">
						<MkInfo v-if="isBaseSilenced" warn>{{ i18n.ts.silencedByBase }}</MkInfo>
						<MkSwitch v-model="isSilenced" :disabled="!meta || !instance || isBaseSilenced" @update:modelValue="toggleSilenced">{{ i18n.ts.silenceThisInstance }}</MkSwitch>
						<MkSwitch v-model="isSuspended" :disabled="!instance || suspensionState == 'softwareSuspended'" @update:modelValue="toggleSuspended">{{ i18n.ts._delivery.stop }}</MkSwitch>
						<MkInfo v-if="isBaseBlocked" warn>{{ i18n.ts.blockedByBase }}</MkInfo>
						<MkSwitch v-model="isBlocked" :disabled="!meta || !instance || isBaseBlocked" @update:modelValue="toggleBlock">{{ i18n.ts.blockThisInstance }}</MkSwitch>
						<MkSwitch v-model="rejectQuotes" :disabled="!instance" @update:modelValue="toggleRejectQuotes">{{ i18n.ts.rejectQuotesInstance }}</MkSwitch>
						<MkSwitch v-model="rejectReports" :disabled="!instance" @update:modelValue="toggleRejectReports">{{ i18n.ts.rejectReports }}</MkSwitch>
						<MkInfo v-if="isBaseMediaSilenced" warn>{{ i18n.ts.mediaSilencedByBase }}</MkInfo>
						<MkSwitch v-model="isMediaSilenced" :disabled="!meta || !instance || isBaseMediaSilenced" @update:modelValue="toggleMediaSilenced">{{ i18n.ts.mediaSilenceThisInstance }}</MkSwitch>

						<MkInput v-model="mandatoryCW" type="text" manualSave @update:modelValue="onMandatoryCWChanged">
							<template #label>{{ i18n.ts.mandatoryCW }}</template>
							<template #caption>{{ i18n.ts.mandatoryCWDescription }}</template>
						</MkInput>

						<div :class="$style.buttonStrip">
							<MkButton inline :disabled="!instance" @click="refreshMetadata"><i class="ph-cloud-arrow-down ph-bold ph-lg"></i> {{ i18n.ts.updateRemoteUser }}</MkButton>
							<MkButton inline :disabled="!instance" danger @click="deleteAllFiles"><i class="ph-trash ph-bold ph-lg"></i> {{ i18n.ts.deleteAllFiles }}</MkButton>
							<MkButton inline :disabled="!instance" danger @click="severAllFollowRelations"><i class="ph-link-break ph-bold ph-lg"></i> {{ i18n.ts.severAllFollowRelations }}</MkButton>
						</div>
					</div>
				</FormSection>
			</div>
			<div v-else-if="tab === 'chart'" class="_gaps_m">
				<div class="cmhjzshl">
					<div class="selects">
						<MkSelect v-model="chartSrc" style="margin: 0 10px 0 0; flex: 1;">
							<option value="instance-requests">{{ i18n.ts._instanceCharts.requests }}</option>
							<option value="instance-users">{{ i18n.ts._instanceCharts.users }}</option>
							<option value="instance-users-total">{{ i18n.ts._instanceCharts.usersTotal }}</option>
							<option value="instance-notes">{{ i18n.ts._instanceCharts.notes }}</option>
							<option value="instance-notes-total">{{ i18n.ts._instanceCharts.notesTotal }}</option>
							<option value="instance-ff">{{ i18n.ts._instanceCharts.ff }}</option>
							<option value="instance-ff-total">{{ i18n.ts._instanceCharts.ffTotal }}</option>
							<option value="instance-drive-usage">{{ i18n.ts._instanceCharts.cacheSize }}</option>
							<option value="instance-drive-usage-total">{{ i18n.ts._instanceCharts.cacheSizeTotal }}</option>
							<option value="instance-drive-files">{{ i18n.ts._instanceCharts.files }}</option>
							<option value="instance-drive-files-total">{{ i18n.ts._instanceCharts.filesTotal }}</option>
						</MkSelect>
					</div>
					<div class="charts">
						<div class="label">{{ i18n.tsx.recentNHours({ n: 90 }) }}</div>
						<MkChart class="chart" :src="chartSrc" span="hour" :limit="90" :args="{ host: host }" :detailed="true"></MkChart>
						<div class="label">{{ i18n.tsx.recentNDays({ n: 90 }) }}</div>
						<MkChart class="chart" :src="chartSrc" span="day" :limit="90" :args="{ host: host }" :detailed="true"></MkChart>
					</div>
				</div>
			</div>
			<div v-else-if="tab === 'users'" class="_gaps_m">
				<MkPagination v-slot="{items}" :pagination="usersPagination" style="display: grid; grid-template-columns: repeat(auto-fill,minmax(270px,1fr)); grid-gap: 12px;">
					<MkA v-for="user in items" :key="user.id" v-tooltip.mfm="i18n.tsx.lastPosted({ at: dateString(user.updatedAt) })" class="user" :to="`/admin/user/${user.id}`">
						<MkUserCardMini :user="user"/>
					</MkA>
				</MkPagination>
			</div>
			<div v-else-if="tab === 'following'" class="_gaps_m">
				<MkPagination v-slot="{items}" :pagination="followingPagination">
					<div class="follow-relations-list">
						<div v-for="followRelationship in items" :key="followRelationship.id" class="follow-relation">
							<MkA v-tooltip.mfm="i18n.tsx.lastPosted({ at: dateString(followRelationship.followee.updatedAt) })" :to="`/admin/user/${followRelationship.followee.id}`" class="user">
								<MkUserCardMini :user="followRelationship.followee" :withChart="false"/>
							</MkA>
							<span class="arrow">→</span>
							<MkA v-tooltip.mfm="i18n.tsx.lastPosted({ at: dateString(followRelationship.follower.updatedAt) })" :to="`/admin/user/${followRelationship.follower.id}`" class="user">
								<MkUserCardMini :user="followRelationship.follower" :withChart="false"/>
							</MkA>
						</div>
					</div>
				</MkPagination>
			</div>
			<div v-else-if="tab === 'followers'" class="_gaps_m">
				<MkPagination v-slot="{items}" :pagination="followersPagination">
					<div class="follow-relations-list">
						<div v-for="followRelationship in items" :key="followRelationship.id" class="follow-relation">
							<MkA v-tooltip.mfm="i18n.tsx.lastPosted({ at: dateString(followRelationship.followee.updatedAt) })" :to="`/admin/user/${followRelationship.followee.id}`" class="user">
								<MkUserCardMini :user="followRelationship.followee" :withChart="false"/>
							</MkA>
							<span class="arrow">←</span>
							<MkA v-tooltip.mfm="i18n.tsx.lastPosted({ at: dateString(followRelationship.follower.updatedAt) })" :to="`/admin/user/${followRelationship.follower.id}`" class="user">
								<MkUserCardMini :user="followRelationship.follower" :withChart="false"/>
							</MkA>
						</div>
					</div>
				</MkPagination>
			</div>
			<div v-else-if="tab === 'raw'" class="_gaps_m">
				<MkObjectView tall :value="instance">
				</MkObjectView>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import type { ChartSrc } from '@/components/MkChart.vue';
import type { Paging } from '@/components/MkPagination.vue';
import type { Badge } from '@/components/SkBadgeStrip.vue';
import MkChart from '@/components/MkChart.vue';
import MkObjectView from '@/components/MkObjectView.vue';
import FormLink from '@/components/form/link.vue';
import MkLink from '@/components/MkLink.vue';
import MkButton from '@/components/MkButton.vue';
import FormSection from '@/components/form/section.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import number from '@/filters/number.js';
import { iAmModerator, iAmAdmin } from '@/i.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkPagination from '@/components/MkPagination.vue';
import { getProxiedImageUrlNullable } from '@/utility/media-proxy.js';
import { dateString } from '@/filters/date.js';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
import sanitizeHtml from '@/utility/sanitize-html';
import { $i } from '@/i.js';
import { store } from '@/store';
import { copyToClipboard } from '@/utility/copy-to-clipboard';
import MkFolder from '@/components/MkFolder.vue';
import MkNumber from '@/components/MkNumber.vue';
import SkBadgeStrip from '@/components/SkBadgeStrip.vue';
import MkInput from '@/components/MkInput.vue';

const props = withDefaults(defineProps<{
	host: string;
	metaHint?: Misskey.entities.AdminMetaResponse;
	instanceHint?: Misskey.entities.FederationInstance;
}>(), {
	metaHint: undefined,
	instanceHint: undefined,
});

const tab = ref('overview');

const chartSrc = ref<ChartSrc>('instance-requests');
const meta = ref<Misskey.entities.AdminMetaResponse | null>(null);
const instance = ref<Misskey.entities.FederationInstance | null>(null);
const suspensionState = ref<'none' | 'manuallySuspended' | 'goneSuspended' | 'autoSuspendedForNotResponding' | 'softwareSuspended'>('none');
const isSuspended = ref(false);
const isBlocked = ref(false);
const isSilenced = ref(false);
const rejectQuotes = ref(false);
const rejectReports = ref(false);
const isMediaSilenced = ref(false);
const faviconUrl = ref<string | null>(null);
const moderationNote = ref('');
const enableHTMLDesctiption = ref(false);

const hasDescriptionHtml = computed(() => instance.value?.description?.includes('</') && instance.value.description.includes('>'));
const mandatoryCW = ref<string | null>(null);

const baseDomains = computed(() => {
	const domains: string[] = [];

	const parts = props.host.toLowerCase().split('.');
	for (let s = 1; s < parts.length; s++) {
		const domain = parts.slice(s).join('.');
		domains.push(domain);
	}

	return domains;
});
const isBaseBlocked = computed(() => meta.value && baseDomains.value.some(d => meta.value?.blockedHosts.includes(d)));
const isBaseSilenced = computed(() => meta.value && baseDomains.value.some(d => meta.value?.silencedHosts.includes(d)));
const isBaseMediaSilenced = computed(() => meta.value && baseDomains.value.some(d => meta.value?.mediaSilencedHosts.includes(d)));

const isSoftMuted = computed({
	get: () => store.r.stpvClientMutedDomains.value.includes(props.host),
	set: (v) => {
		if (v) {
			store.set('stpvClientMutedDomains', [props.host, ...store.s.stpvClientMutedDomains].slice(0, 100));
		} else {
			store.set('stpvClientMutedDomains', store.s.stpvClientMutedDomains
				.filter(x => x !== props.host)
				.filter(x => x)
				.slice(0, 100),
			);
		}
	},
});
const badges = computed(() => {
	const arr: Badge[] = [];
	if (instance.value) {
		if (instance.value.isBlocked) {
			arr.push({
				key: 'blocked',
				label: i18n.ts.blocked,
				style: 'error',
			});
		}
		if (instance.value.isSuspended) {
			arr.push({
				key: 'suspended',
				label: i18n.ts.suspended,
				style: 'error',
			});
		}
		if (instance.value.isSilenced) {
			arr.push({
				key: 'silenced',
				label: i18n.ts.silenced,
				style: 'warning',
			});
		}
		if (instance.value.isMediaSilenced) {
			arr.push({
				key: 'media_silenced',
				label: i18n.ts.mediaSilenced,
				style: 'warning',
			});
		}
		if (instance.value.mandatoryCW) {
			arr.push({
				key: 'cw',
				label: i18n.ts.cw,
				style: 'warning',
			});
		}
		if (instance.value.isBubbled) {
			arr.push({
				key: 'bubbled',
				label: i18n.ts.bubble,
				style: 'success',
			});
		}
	}
	return arr;
});

const usersPagination = {
	endpoint: iAmModerator ? 'admin/show-users' : 'users',
	limit: 10,
	params: {
		sort: '+updatedAt',
		state: 'all',
		hostname: props.host,
	},
	offsetMode: true,
} satisfies Paging;

const followingPagination = {
	endpoint: 'federation/following' as const,
	limit: 10,
	params: {
		host: props.host,
		includeFollower: true,
	},
	offsetMode: false,
} satisfies Paging;

const followersPagination = {
	endpoint: 'federation/followers' as const,
	limit: 10,
	params: {
		host: props.host,
		includeFollower: true,
	},
	offsetMode: false,
} satisfies Paging;

async function saveModerationNote() {
	if (iAmModerator) {
		await os.promiseDialog(async () => {
			if (instance.value == null) return;
			await os.apiWithDialog('admin/federation/update-instance', { host: instance.value.host, moderationNote: moderationNote.value });
			await fetch();
		});
	}
}

async function onMandatoryCWChanged(value: string | number) {
	await os.promiseDialog(async () => {
		await misskeyApi('admin/cw-instance', { host: props.host, cw: String(value) || null });
		await fetch();
	});
}

async function fetch(withHint = false): Promise<void> {
	const [m, i] = await Promise.all([
		(withHint && props.metaHint)
			? props.metaHint
			: iAmAdmin ? misskeyApi('admin/meta') : null,
		(withHint && props.instanceHint)
			? props.instanceHint
			: misskeyApi('federation/show-instance', {
				host: props.host,
			}),
	]);
	meta.value = m;
	instance.value = i;

	suspensionState.value = instance.value?.suspensionState ?? 'none';
	isSuspended.value = suspensionState.value !== 'none';
	isBlocked.value = instance.value?.isBlocked ?? false;
	isSilenced.value = instance.value?.isSilenced ?? false;
	rejectReports.value = instance.value?.rejectReports ?? false;
	rejectQuotes.value = instance.value?.rejectQuotes ?? false;
	isMediaSilenced.value = instance.value?.isMediaSilenced ?? false;
	faviconUrl.value = getProxiedImageUrlNullable(instance.value?.faviconUrl, 'preview') ?? getProxiedImageUrlNullable(instance.value?.iconUrl, 'preview');
	moderationNote.value = instance.value?.moderationNote ?? '';
	mandatoryCW.value = instance.value?.mandatoryCW ?? '';
}

async function toggleBlock(): Promise<void> {
	if (!iAmAdmin) return;
	await os.promiseDialog(async () => {
		if (!meta.value) throw new Error('No meta?');
		if (!instance.value) throw new Error('No instance?');
		const { host } = instance.value;
		await os.apiWithDialog('admin/update-meta', {
			blockedHosts: isBlocked.value ? meta.value.blockedHosts.concat([host]) : meta.value.blockedHosts.filter(x => x !== host),
		});
		await fetch();
	});
}

async function toggleSilenced(): Promise<void> {
	if (!iAmAdmin) return;
	await os.promiseDialog(async () => {
		if (!meta.value) throw new Error('No meta?');
		if (!instance.value) throw new Error('No instance?');
		const { host } = instance.value;
		const silencedHosts = meta.value.silencedHosts ?? [];
		await os.promiseDialog(async () => {
			await misskeyApi('admin/update-meta', {
				silencedHosts: isSilenced.value ? silencedHosts.concat([host]) : silencedHosts.filter(x => x !== host),
			});
			await fetch();
		});
	});
}

async function toggleMediaSilenced(): Promise<void> {
	if (!iAmAdmin) return;
	await os.promiseDialog(async () => {
		if (!meta.value) throw new Error('No meta?');
		if (!instance.value) throw new Error('No instance?');
		const { host } = instance.value;
		const mediaSilencedHosts = meta.value.mediaSilencedHosts ?? [];
		await misskeyApi('admin/update-meta', {
			mediaSilencedHosts: isMediaSilenced.value ? mediaSilencedHosts.concat([host]) : mediaSilencedHosts.filter(x => x !== host),
		});
		await fetch();
	});
}

async function toggleSuspended(): Promise<void> {
	if (!iAmModerator) return;
	if (suspensionState.value === 'softwareSuspended') return;
	await os.promiseDialog(async () => {
		if (!instance.value) throw new Error('No instance?');
		suspensionState.value = isSuspended.value ? 'manuallySuspended' : 'none';
		await misskeyApi('admin/federation/update-instance', {
			host: instance.value.host,
			isSuspended: isSuspended.value,
		});
		await fetch();
	});
}

async function toggleRejectReports(): Promise<void> {
	if (!iAmModerator) return;
	await os.promiseDialog(async () => {
		if (!instance.value) throw new Error('No instance?');
		await misskeyApi('admin/federation/update-instance', {
			host: instance.value.host,
			rejectReports: rejectReports.value,
		});
		await fetch();
	});
}

async function toggleRejectQuotes(): Promise<void> {
	if (!iAmModerator) return;
	await os.promiseDialog(async () => {
		if (!instance.value) throw new Error('No instance?');
		await misskeyApi('admin/federation/update-instance', {
			host: instance.value.host,
			rejectQuotes: rejectQuotes.value,
		});
		await fetch();
	});
}

async function refreshMetadata(): Promise<void> {
	if (!iAmModerator) return;
	await os.promiseDialog(async () => {
		if (!instance.value) throw new Error('No instance?');
		await misskeyApi('admin/federation/refresh-remote-instance-metadata', {
			host: instance.value.host,
		});
		await fetch();
	});
	await os.alert({
		text: 'Refresh requested',
	});
}

async function deleteAllFiles(): Promise<void> {
	if (!iAmModerator) return;
	if (!instance.value) throw new Error('No instance?');

	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.deleteAllFilesConfirm,
	});
	if (confirm.canceled) return;

	await os.apiWithDialog('admin/federation/delete-all-files', {
		host: instance.value.host,
	});
	await os.alert({
		text: i18n.ts.deleteAllFilesQueued,
	});
}

async function severAllFollowRelations(): Promise<void> {
	if (!iAmModerator) return;
	if (!instance.value) throw new Error('No instance?');

	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.tsx.severAllFollowRelationsConfirm({
			instanceName: instance.value.name ?? instance.value.host,
			followingCount: instance.value.followingCount,
			followersCount: instance.value.followersCount,
		}),
	});
	if (confirm.canceled) return;

	await os.apiWithDialog('admin/federation/remove-all-following', {
		host: instance.value.host,
	});
	await os.alert({
		text: i18n.tsx.severAllFollowRelationsQueued({ host: instance.value.host }),
	});
}

fetch(true);

const headerActions = computed(() => [{
	text: `https://${props.host}`,
	icon: 'ti ti-external-link',
	handler: () => {
		window.open(`https://${props.host}`, '_blank', 'noopener');
	},
}]);

const headerTabs = computed(() => [{
	key: 'overview',
	title: i18n.ts.overview,
	icon: 'ti ti-info-circle',
}, {
	key: 'users',
	title: i18n.ts.users,
	icon: 'ti ti-users',
}, ...getFollowingTabs(), {
	key: 'chart',
	title: i18n.ts.charts,
	icon: 'ti ti-chart-line',
}, {
	key: 'raw',
	title: i18n.ts.raw,
	icon: 'ti ti-code',
}]);

function getFollowingTabs() {
	if (!$i) return [];
	return [
		{
			key: 'following',
			title: i18n.ts.following,
			icon: 'ti ti-arrow-right',
		},
		{
			key: 'followers',
			title: i18n.ts.followers,
			icon: 'ti ti-arrow-left',
		},
	];
}

definePage(() => ({
	title: props.host,
	icon: 'ti ti-server',
}));
</script>

<style lang="scss" scoped>
.fnfelxur {
	display: flex;
	align-items: center;

	> .icon {
		display: block;
		margin: 0 16px 0 0;
		height: 64px;
		border-radius: var(--MI-radius-sm);
	}

	> .name {
		word-break: break-all;
	}
}

.cmhjzshl {
	> .selects {
		display: flex;
		margin: 0 0 16px 0;
	}

	> .charts {
		> .label {
			margin-bottom: 12px;
			font-weight: bold;
		}
	}
}

.follow-relations-list {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .follow-relation {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: nowrap;
    justify-content: space-between;

    .user {
      flex: 1;
      max-width: 45%;
      flex-shrink: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .arrow {
      font-size: 1.5em;
      flex-shrink: 0;
    }
  }
}
</style>

<style lang="scss" module>
.headerData {
	display: flex;
	flex-direction: column;

	> * {
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 85%;
		opacity: 0.7;
	}

	> :first-child {
		text-overflow: initial;
		word-break: break-all;
		font-size: 100%;
		opacity: 1.0;
	}
}

.linksList {
	margin: 0;
	padding-left: 1.5em;
}

// Sync with admin-user.vue
.buttonStrip {
	margin: calc(var(--MI-margin) / 2 * -1);

	>* {
		margin: calc(var(--MI-margin) / 2);
	}
}
</style>
