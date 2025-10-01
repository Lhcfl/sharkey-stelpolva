<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs" :spacer="true" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
	<FormSuspense v-if="init" :p="init">
		<div v-if="user && info">
			<div v-if="tab === 'overview'" class="_gaps">
				<div class="aeakzknw">
					<MkAvatar class="avatar" :user="user" indicator link preview/>
					<div class="body">
						<span class="name"><MkUserName class="name" :user="user"/></span>
						<span class="sub">
							<span class="acct _monospace">@{{ acct(user) }}</span>
							<button v-tooltip="i18n.ts.copy" class="_textButton" style="margin-left: 0.5em;" @click="copyToClipboard('@' + acct(user))"><i class="ti ti-copy"></i></button>
						</span>
						<span class="sub">
							<span class="_monospace">{{ user.id }}</span>
							<button v-tooltip="i18n.ts.copy" class="_textButton" style="margin-left: 0.5em;" @click="copyToClipboard(user.id)"><i class="ti ti-copy"></i></button>
						</span>
					</div>
				</div>

				<SkBadgeStrip v-if="badges.length > 0" :badges="badges"></SkBadgeStrip>

				<MkInfo v-if="isSystem">{{ i18n.ts.isSystemAccount }}</MkInfo>

				<MkFolder v-if="!isSystem" :sticky="false">
					<template #icon><i class="ph-list-bullets ph-bold ph-lg"></i></template>
					<template #label>{{ i18n.ts.details }}</template>
					<div style="display: flex; flex-direction: column; gap: 1em;">
						<MkKeyValue v-if="user" :copy="user.id" oneline>
							<template #key>{{ i18n.ts.id }}</template>
							<template #value><span class="_monospace">{{ user.id }}</span></template>
						</MkKeyValue>
						<MkKeyValue v-if="user" :copy="'@' + acct(user)" oneline>
							<template #key>{{ i18n.ts.username }}</template>
							<template #value><span class="_monospace">@{{ acct(user) }}</span></template>
						</MkKeyValue>
						<!-- 要る？
						<MkKeyValue v-if="ips.length > 0" :copy="user.id" oneline>
							<template #key>IP (recent)</template>
							<template #value><span class="_monospace">{{ ips[0].ip }}</span></template>
						</MkKeyValue>
						-->
						<MkKeyValue oneline>
							<template #key>{{ i18n.ts.createdAt }}</template>
							<template #value><span class="_monospace"><MkTime :time="user.createdAt" :mode="'detail'"/></span></template>
						</MkKeyValue>
						<MkKeyValue v-if="info" oneline>
							<template #key>{{ i18n.ts.lastActiveDate }}</template>
							<template #value><span class="_monospace"><MkTime :time="info.lastActiveDate" :mode="'detail'"/></span></template>
						</MkKeyValue>
						<MkKeyValue v-if="info" oneline>
							<template #key>{{ i18n.ts.email }}</template>
							<template #value><span class="_monospace">{{ info.email }}</span></template>
						</MkKeyValue>
						<MkKeyValue v-if="info" oneline>
							<template #key>{{ i18n.ts.totalFollowers }}</template>
							<template #value><span class="_monospace"><MkNumber :value="info.followStats.totalFollowers"></MkNumber></span></template>
						</MkKeyValue>
						<MkKeyValue v-if="info" oneline>
							<template #key>{{ i18n.ts.totalFollowing }}</template>
							<template #value><span class="_monospace"><MkNumber :value="info.followStats.totalFollowing"></MkNumber></span></template>
						</MkKeyValue>
						<MkKeyValue v-if="info" oneline>
							<template #key>{{ i18n.ts.remoteFollowers }}</template>
							<template #value><span class="_monospace"><MkNumber :value="info.followStats.remoteFollowers"></MkNumber></span></template>
						</MkKeyValue>
						<MkKeyValue v-if="info" oneline>
							<template #key>{{ i18n.ts.remoteFollowing }}</template>
							<template #value><span class="_monospace"><MkNumber :value="info.followStats.remoteFollowing"></MkNumber></span></template>
						</MkKeyValue>
						<MkKeyValue v-if="info" oneline>
							<template #key>{{ i18n.ts.localFollowers }}</template>
							<template #value><span class="_monospace"><MkNumber :value="info.followStats.localFollowers"></MkNumber></span></template>
						</MkKeyValue>
						<MkKeyValue v-if="info" oneline>
							<template #key>{{ i18n.ts.localFollowing }}</template>
							<template #value><span class="_monospace"><MkNumber :value="info.followStats.localFollowing"></MkNumber></span></template>
						</MkKeyValue>
					</div>
				</MkFolder>

				<MkFolder v-if="info" :sticky="false">
					<template #icon><i class="ph-scroll ph-bold ph-lg"></i></template>
					<template #label>{{ i18n.ts._role.policies }}</template>
					<div class="_gaps">
						<div v-for="policy in Object.keys(info.policies)" :key="policy">
							{{ policy }} ... {{ info.policies[policy] }}
						</div>
					</div>
				</MkFolder>

				<MkFolder v-if="iAmAdmin && ips && ips.length > 0" :sticky="false">
					<template #icon><i class="ph-network ph-bold ph-lg"></i></template>
					<template #label>{{ i18n.ts.ip }}</template>
					<MkInfo>{{ i18n.ts.ipTip }}</MkInfo>
					<div v-for="record in ips" :key="record.ip" class="_monospace" :class="$style.ip" style="margin: 1em 0;">
						<span class="date">{{ record.createdAt }}</span>
						<span class="ip">{{ record.ip }}</span>
					</div>
				</MkFolder>

				<MkFolder v-if="iAmModerator" :defaultOpen="moderationNote.length > 0" :sticky="false">
					<template #icon><i class="ph-stamp ph-bold ph-lg"></i></template>
					<template #label>{{ i18n.ts.moderationNote }}</template>
					<MkTextarea v-model="moderationNote" manualSave @update:modelValue="onModerationNoteChanged">
						<template #label>{{ i18n.ts.moderationNote }}</template>
						<template #caption>{{ i18n.ts.moderationNoteDescription }}</template>
					</MkTextarea>
				</MkFolder>

				<FormSection v-if="user?.host">
					<template #label>{{ i18n.ts.activityPub }}</template>

					<div class="_gaps_m">
						<div style="display: flex; flex-direction: column; gap: 1em;">
							<MkKeyValue oneline>
								<template #key>{{ i18n.ts.instanceInfo }}</template>
								<template #value><MkA :to="`/instance-info/${user.host}`" class="_link">{{ user.host }} <i class="ti ti-chevron-right"></i></MkA></template>
							</MkKeyValue>
							<MkKeyValue oneline>
								<template #key>{{ i18n.ts.updatedAt }}</template>
								<template #value><MkTime mode="detail" :time="user.lastFetchedAt"/></template>
							</MkKeyValue>
						</div>
					</div>
				</FormSection>

				<FormSection v-else-if="info.signupReason">
					<template #label>{{ i18n.ts.signupReason }}</template>
					{{ info.signupReason }}
				</FormSection>

				<FormSection v-if="!isSystem && user && iAmModerator">
					<div class="_gaps">
						<MkSwitch v-model="silenced" @update:modelValue="toggleSilence">{{ i18n.ts.silence }}</MkSwitch>
						<MkSwitch v-if="!isSystem" v-model="suspended" @update:modelValue="toggleSuspend">{{ i18n.ts.suspend }}</MkSwitch>
						<MkSwitch v-model="rejectQuotes" @update:modelValue="toggleRejectQuotes">{{ user.host == null ? i18n.ts.rejectQuotesLocalUser : i18n.ts.rejectQuotesRemoteUser }}</MkSwitch>
						<MkSwitch v-model="markedAsNSFW" @update:modelValue="toggleNSFW">{{ i18n.ts.markAsNSFW }}</MkSwitch>

						<MkInput v-model="mandatoryCW" type="text" manualSave @update:modelValue="onMandatoryCWChanged">
							<template #label>{{ i18n.ts.mandatoryCW }}</template>
							<template #caption>{{ i18n.ts.mandatoryCWDescription }}</template>
						</MkInput>

						<div :class="$style.buttonStrip">
							<MkButton v-if="user.host != null" inline @click="updateRemoteUser"><i class="ph-cloud-arrow-down ph-bold ph-lg"></i> {{ i18n.ts.updateRemoteUser }}</MkButton>
							<MkButton v-if="user.host == null" inline accent @click="resetPassword"><i class="ph-password ph-bold ph-lg"></i> {{ i18n.ts.resetPassword }}</MkButton>
							<MkButton inline accent @click="unsetUserAvatar"><i class="ph-camera-slash ph-bold ph-lg"></i> {{ i18n.ts.unsetUserAvatar }}</MkButton>
							<MkButton inline accent @click="unsetUserBanner"><i class="ph-image-broken ph-bold ph-lg"></i> {{ i18n.ts.unsetUserBanner }}</MkButton>
							<MkButton inline danger @click="deleteAllFiles"><i class="ph-trash ph-bold ph-lg"></i> {{ i18n.ts.deleteAllFiles }}</MkButton>
							<MkButton v-if="iAmAdmin" inline danger @click="deleteAccount"><i class="ph-skull ph-bold ph-lg"></i> {{ i18n.ts.deleteAccount }}</MkButton>
						</div>
					</div>
				</FormSection>
			</div>

			<div v-else-if="tab === 'roles'" class="_gaps">
				<MkButton primary rounded @click="assignRole"><i class="ti ti-plus"></i> {{ i18n.ts.assign }}</MkButton>

				<div v-for="role in info.roles" :key="role.id">
					<div :class="$style.roleItemMain">
						<MkRolePreview :class="$style.role" :role="role" :forModeration="true"/>
						<button class="_button" @click="toggleRoleItem(role)">
							<i v-if="!expandedRoles.includes(role.id)" class="ti ti-chevron-down"></i>
							<i v-if="expandedRoles.includes(role.id)" class="ti ti-chevron-left"></i>
						</button>
						<button v-if="role.target === 'manual' || info.roleAssigns.some(a => a.roleId === role.id)" class="_button" :class="$style.roleUnassign" @click="unassignRole(role, $event)"><i class="ti ti-x"></i></button>
						<button v-else class="_button" :class="$style.roleUnassign" disabled><i class="ti ti-ban"></i></button>
					</div>
					<div v-if="expandedRoles.includes(role.id)" :class="$style.roleItemSub">
						<template v-if="info.roleAssigns.some(a => a.roleId === role.id)">
							<div>{{ i18n.ts.roleAssigned }}: <MkTime :time="info.roleAssigns.find(a => a.roleId === role.id).createdAt" mode="detail"/></div>
							<div v-if="info.roleAssigns.find(a => a.roleId === role.id).expiresAt">{{ i18n.ts.rolePeriod }}: {{ new Date(info.roleAssigns.find(a => a.roleId === role.id).expiresAt).toLocaleString() }}</div>
							<div v-else>{{ i18n.ts.rolePeriod }}: {{ i18n.ts.indefinitely }}</div>
						</template>
						<template v-else>
							<div>{{ i18n.ts.roleAssigned }}: {{ i18n.ts.roleAutomatic }}</div>
						</template>
					</div>
				</div>
			</div>

			<div v-else-if="tab === 'announcements'" class="_gaps">
				<MkButton primary rounded @click="createAnnouncement"><i class="ti ti-plus"></i> {{ i18n.ts._announcement.new }}</MkButton>

				<MkSelect v-model="announcementsStatus">
					<template #label>{{ i18n.ts.filter }}</template>
					<option value="active">{{ i18n.ts.active }}</option>
					<option value="archived">{{ i18n.ts.archived }}</option>
				</MkSelect>

				<MkPagination :pagination="announcementsPagination">
					<template #default="{ items }">
						<div class="_gaps_s">
							<div v-for="announcement in items" :key="announcement.id" v-panel :class="$style.announcementItem" @click="editAnnouncement(announcement)">
								<span style="margin-right: 0.5em;">
									<i v-if="announcement.icon === 'info'" class="ti ti-info-circle"></i>
									<i v-else-if="announcement.icon === 'warning'" class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i>
									<i v-else-if="announcement.icon === 'error'" class="ti ti-circle-x" style="color: var(--MI_THEME-error);"></i>
									<i v-else-if="announcement.icon === 'success'" class="ti ti-check" style="color: var(--MI_THEME-success);"></i>
								</span>
								<span>{{ announcement.title }}</span>
								<span v-if="announcement.reads > 0" style="margin-left: auto; opacity: 0.7;">{{ i18n.ts.messageRead }}</span>
							</div>
						</div>
					</template>
				</MkPagination>
			</div>

			<div v-else-if="tab === 'drive'" class="_gaps">
				<MkFileListForAdmin :pagination="filesPagination" viewMode="grid"/>
			</div>

			<div v-else-if="tab === 'chart'" class="_gaps_m">
				<div class="cmhjzshm">
					<div class="selects">
						<MkSelect v-model="chartSrc" style="margin: 0 10px 0 0; flex: 1;">
							<option value="per-user-notes">{{ i18n.ts.notes }}</option>
						</MkSelect>
					</div>
					<div class="charts">
						<div class="label">{{ i18n.tsx.recentNHours({ n: 90 }) }}</div>
						<MkChart class="chart" :src="chartSrc" span="hour" :limit="90" :args="{ user, withoutAll: true }" :detailed="true"></MkChart>
						<div class="label">{{ i18n.tsx.recentNDays({ n: 90 }) }}</div>
						<MkChart class="chart" :src="chartSrc" span="day" :limit="90" :args="{ user, withoutAll: true }" :detailed="true"></MkChart>
					</div>
				</div>
			</div>

			<div v-else-if="tab === 'raw'" class="_gaps_m">
				<MkFolder :sticky="false" :defaultOpen="true">
					<template #icon><i class="ph-user-circle ph-bold ph-lg"></i></template>
					<template #label>{{ i18n.ts.user }}</template>
					<template #header>
						<div :class="$style.rawFolderHeader">
							<span>{{ i18n.ts.rawUserDescription }}</span>
							<button class="_textButton" @click="copyToClipboard(JSON.stringify(user, null, 4))"><i class="ti ti-copy"></i> {{ i18n.ts.copy }}</button>
						</div>
					</template>

					<MkObjectView tall :value="user"/>
				</MkFolder>

				<MkFolder :sticky="false">
					<template #icon><i class="ti ti-info-circle"></i></template>
					<template #label>{{ i18n.ts.details }}</template>
					<template #header>
						<div :class="$style.rawFolderHeader">
							<span>{{ i18n.ts.rawInfoDescription }}</span>
							<button class="_textButton" @click="copyToClipboard(JSON.stringify(info, null, 4))"><i class="ti ti-copy"></i> {{ i18n.ts.copy }}</button>
						</div>
					</template>

					<MkObjectView tall :value="info"/>
				</MkFolder>

				<MkFolder v-if="ap" :sticky="false">
					<template #icon><i class="ph-globe ph-bold ph-lg"></i></template>
					<template #label>{{ i18n.ts.activityPub }}</template>
					<template #header>
						<div :class="$style.rawFolderHeader">
							<span>{{ i18n.ts.rawApDescription }}</span>
							<button class="_textButton" @click="copyToClipboard(JSON.stringify(ap, null, 4))"><i class="ti ti-copy"></i> {{ i18n.ts.copy }}</button>
						</div>
					</template>
					<MkObjectView tall :value="ap"/>
				</MkFolder>
			</div>
		</div>
	</FormSuspense>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, watch, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import type { Badge } from '@/components/SkBadgeStrip.vue';
import type { ChartSrc } from '@/components/MkChart.vue';
import MkChart from '@/components/MkChart.vue';
import MkObjectView from '@/components/MkObjectView.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import FormLink from '@/components/form/link.vue';
import FormSection from '@/components/form/section.vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import MkSelect from '@/components/MkSelect.vue';
import FormSuspense from '@/components/form/suspense.vue';
import MkFileListForAdmin from '@/components/MkFileListForAdmin.vue';
import MkInfo from '@/components/MkInfo.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { acct } from '@/filters/user.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { iAmAdmin, $i, iAmModerator } from '@/i.js';
import MkRolePreview from '@/components/MkRolePreview.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkInput from '@/components/MkInput.vue';
import MkNumber from '@/components/MkNumber.vue';
import { copyToClipboard } from '@/utility/copy-to-clipboard';
import SkBadgeStrip from '@/components/SkBadgeStrip.vue';

const props = withDefaults(defineProps<{
	userId: string;
	initialTab?: string;
	userHint?: Misskey.entities.UserDetailed;
	infoHint?: Misskey.entities.AdminShowUserResponse;
	ipsHint?: Misskey.entities.AdminGetUserIpsResponse;
	apHint?: Misskey.entities.ApGetResponse;
}>(), {
	initialTab: 'overview',
	userHint: undefined,
	infoHint: undefined,
	ipsHint: undefined,
	apHint: undefined,
});

const tab = ref(props.initialTab);
const chartSrc = ref<ChartSrc>('per-user-notes');
const user = ref<null | Misskey.entities.UserDetailed>();
const init = ref<ReturnType<typeof createFetcher>>();
const info = ref<Misskey.entities.AdminShowUserResponse | null>(null);
const ips = ref<Misskey.entities.AdminGetUserIpsResponse | null>(null);
const ap = ref<Misskey.entities.ApGetResponse | null>(null);
const moderator = ref(false);
const silenced = ref(false);
const approved = ref(false);
const suspended = ref(false);
const rejectQuotes = ref(false);
const markedAsNSFW = ref(false);
const moderationNote = ref('');
const mandatoryCW = ref<string | null>(null);
const isSystem = computed(() => info.value?.isSystem ?? false);
const filesPagination = {
	endpoint: 'admin/drive/files' as const,
	limit: 10,
	params: computed(() => ({
		userId: props.userId,
	})),
};

const badges = computed(() => {
	const arr: Badge[] = [];
	if (info.value && user.value) {
		if (info.value.isSuspended) {
			arr.push({
				key: 'suspended',
				label: i18n.ts.suspended,
				style: 'error',
			});
		}

		if (info.value.isSilenced) {
			arr.push({
				key: 'silenced',
				label: i18n.ts.silenced,
				style: 'warning',
			});
		}

		if (info.value.alwaysMarkNsfw) {
			arr.push({
				key: 'nsfw',
				label: i18n.ts.nsfw,
				style: 'warning',
			});
		}

		if (user.value.mandatoryCW) {
			arr.push({
				key: 'cw',
				label: i18n.ts.cw,
				style: 'warning',
			});
		}

		if (info.value.isHibernated) {
			arr.push({
				key: 'hibernated',
				label: i18n.ts.hibernated,
				style: 'neutral',
			});
		}

		if (info.value.isAdministrator) {
			arr.push({
				key: 'admin',
				label: i18n.ts.administrator,
				style: 'success',
			});
		} else if (info.value.isModerator) {
			arr.push({
				key: 'mod',
				label: i18n.ts.moderator,
				style: 'success',
			});
		}

		if (user.value.host == null) {
			if (info.value.email) {
				if (info.value.emailVerified) {
					arr.push({
						key: 'verified',
						label: i18n.ts.verified,
						style: 'success',
					});
				} else {
					arr.push({
						key: 'not_verified',
						label: i18n.ts.notVerified,
						style: 'success',
					});
				}
			}

			if (info.value.approved) {
				arr.push({
					key: 'approved',
					label: i18n.ts.approved,
					style: 'success',
				});
			} else {
				arr.push({
					key: 'not_approved',
					label: i18n.ts.notApproved,
					style: 'warning',
				});
			}
		}
	}
	return arr;
});

const announcementsStatus = ref<'active' | 'archived'>('active');

const announcementsPagination = {
	endpoint: 'admin/announcements/list' as const,
	limit: 10,
	params: computed(() => ({
		userId: props.userId,
		status: announcementsStatus.value,
	})),
};
const expandedRoles = ref<string[]>([]);

function createFetcher(withHint = true) {
	return () => Promise.all([
		(withHint && props.userHint) ? props.userHint : misskeyApi('users/show', {
			userId: props.userId,
		}),
		(withHint && props.infoHint) ? props.infoHint : misskeyApi('admin/show-user', {
			userId: props.userId,
		}),
		iAmAdmin
			? (withHint && props.ipsHint) ? props.ipsHint : misskeyApi('admin/get-user-ips', {
				userId: props.userId,
			})
			: null,
		iAmAdmin
			? (withHint && props.apHint) ? props.apHint : misskeyApi('ap/get', {
				userId: props.userId,
			}).catch(() => null) : null],
	).then(async ([_user, _info, _ips, _ap]) => {
		user.value = _user;
		info.value = _info;
		ips.value = _ips;
		ap.value = _ap;
		moderator.value = _info.isModerator;
		silenced.value = _info.isSilenced;
		approved.value = _info.approved;
		markedAsNSFW.value = _info.alwaysMarkNsfw;
		suspended.value = _info.isSuspended;
		rejectQuotes.value = _user.rejectQuotes ?? false;
		moderationNote.value = _info.moderationNote;
		mandatoryCW.value = _user.mandatoryCW;
	});
}

async function refreshUser() {
	// Not a typo - createFetcher() returns a function()
	await createFetcher(false)();
}

async function onMandatoryCWChanged(value: string | number) {
	await os.promiseDialog(async () => {
		await misskeyApi('admin/cw-user', { userId: props.userId, cw: String(value) || null });
		await refreshUser();
	});
}

async function onModerationNoteChanged(value: string) {
	await os.promiseDialog(async () => {
		await misskeyApi('admin/update-user-note', { userId: props.userId, text: value });
		await refreshUser();
	});
}

async function updateRemoteUser() {
	await os.promiseDialog(async () => {
		await misskeyApi('federation/update-remote-user', { userId: props.userId });
		await refreshUser();
	});
}

async function resetPassword() {
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.resetPasswordConfirm,
	});
	if (confirm.canceled) {
		return;
	} else {
		const { password } = await misskeyApi('admin/reset-password', {
			userId: props.userId,
		});
		await os.alert({
			type: 'success',
			text: i18n.tsx.newPasswordIs({ password }),
		});
	}
}

async function toggleNSFW(v) {
	const confirm = await os.confirm({
		type: 'warning',
		text: v ? i18n.ts.nsfwConfirm : i18n.ts.unNsfwConfirm,
	});
	if (confirm.canceled) {
		markedAsNSFW.value = !v;
	} else {
		await misskeyApi(v ? 'admin/nsfw-user' : 'admin/unnsfw-user', { userId: props.userId });
		await refreshUser();
	}
}

async function toggleSilence(v) {
	const confirm = await os.confirm({
		type: 'warning',
		text: v ? i18n.ts.silenceConfirm : i18n.ts.unsilenceConfirm,
	});
	if (confirm.canceled) {
		silenced.value = !v;
	} else {
		await os.promiseDialog(async () => {
			await misskeyApi(v ? 'admin/silence-user' : 'admin/unsilence-user', { userId: props.userId });
			await refreshUser();
		});
	}
}

async function toggleSuspend(v) {
	const confirm = await os.confirm({
		type: 'warning',
		text: v ? i18n.ts.suspendConfirm : i18n.ts.unsuspendConfirm,
	});
	if (confirm.canceled) {
		suspended.value = !v;
	} else {
		await os.promiseDialog(async () => {
			await misskeyApi(v ? 'admin/suspend-user' : 'admin/unsuspend-user', { userId: props.userId });
			await refreshUser();
		});
	}
}

async function toggleRejectQuotes(v: boolean): Promise<void> {
	const confirm = await os.confirm({
		type: 'warning',
		text: v ? i18n.ts.rejectQuotesConfirm : i18n.ts.allowQuotesConfirm,
	});
	if (confirm.canceled) {
		rejectQuotes.value = !v;
	} else {
		await os.promiseDialog(async () => {
			await misskeyApi('admin/reject-quotes', {
				userId: props.userId,
				rejectQuotes: v,
			});
			await refreshUser();
		});
	}
}

async function unsetUserAvatar() {
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.unsetUserAvatarConfirm,
	});
	if (confirm.canceled) return;
	await os.promiseDialog(async () => {
		await misskeyApi('admin/unset-user-avatar', { userId: props.userId });
		await refreshUser();
	});
}

async function unsetUserBanner() {
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.unsetUserBannerConfirm,
	});
	if (confirm.canceled) return;
	await os.promiseDialog(async () => {
		await misskeyApi('admin/unset-user-banner', { userId: props.userId });
		await refreshUser();
	});
}

async function deleteAllFiles() {
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.deleteAllFilesConfirm,
	});
	if (confirm.canceled) return;
	await os.promiseDialog(async () => {
		await misskeyApi('admin/delete-all-files-of-a-user', { userId: props.userId });
		await refreshUser();
	});
}

async function deleteAccount() {
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.deleteThisAccountConfirm,
	});
	if (confirm.canceled) return;
	if (!user.value) return;

	const typed = await os.inputText({
		text: i18n.tsx.typeToConfirm({ x: user.value.username }),
	});
	if (typed.canceled) return;

	if (typed.result === user.value.username) {
		await os.apiWithDialog('admin/delete-account', {
			userId: props.userId,
		});
	} else {
		await os.alert({
			type: 'error',
			text: 'input not match',
		});
	}
}

async function assignRole() {
	const roles = await misskeyApi('admin/roles/list').then(it => it.filter(r => r.target === 'manual'));

	const { canceled, result: roleId } = await os.select({
		title: i18n.ts._role.chooseRoleToAssign,
		items: roles.map(r => ({ text: r.name, value: r.id })),
	});
	if (canceled) return;

	const { canceled: canceled2, result: period } = await os.select({
		title: i18n.ts.period + ': ' + roles.find(r => r.id === roleId)!.name,
		items: [{
			value: 'indefinitely', text: i18n.ts.indefinitely,
		}, {
			value: 'oneHour', text: i18n.ts.oneHour,
		}, {
			value: 'oneDay', text: i18n.ts.oneDay,
		}, {
			value: 'oneWeek', text: i18n.ts.oneWeek,
		}, {
			value: 'oneMonth', text: i18n.ts.oneMonth,
		}],
		default: 'indefinitely',
	});
	if (canceled2) return;

	const expiresAt = period === 'indefinitely' ? null
		: period === 'oneHour' ? Date.now() + (1000 * 60 * 60)
		: period === 'oneDay' ? Date.now() + (1000 * 60 * 60 * 24)
		: period === 'oneWeek' ? Date.now() + (1000 * 60 * 60 * 24 * 7)
		: period === 'oneMonth' ? Date.now() + (1000 * 60 * 60 * 24 * 30)
		: null;

	await os.promiseDialog(async () => {
		await misskeyApi('admin/roles/assign', { roleId, userId: props.userId, expiresAt });
		await refreshUser();
	});
}

async function unassignRole(role, ev) {
	await os.popupMenu([{
		text: i18n.ts.unassign,
		icon: 'ti ti-x',
		danger: true,
		action: async () => {
			await os.promiseDialog(async () => {
				await misskeyApi('admin/roles/unassign', { roleId: role.id, userId: props.userId });
				await refreshUser();
			});
		},
	}], ev.currentTarget ?? ev.target);
}

function toggleRoleItem(role: Misskey.entities.Role) {
	if (expandedRoles.value.includes(role.id)) {
		expandedRoles.value = expandedRoles.value.filter(x => x !== role.id);
	} else {
		expandedRoles.value.push(role.id);
	}
}

function createAnnouncement() {
	if (!user.value) return;
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkUserAnnouncementEditDialog.vue')), {
		user: user.value,
	}, {
		closed: () => dispose(),
	});
}

function editAnnouncement(announcement) {
	if (!user.value) return;
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkUserAnnouncementEditDialog.vue')), {
		user: user.value,
		announcement,
	}, {
		closed: () => dispose(),
	});
}

watch(() => props.userId, () => {
	init.value = createFetcher();
}, {
	immediate: true,
});

const headerActions = computed(() => []);

const headerTabs = computed(() => isSystem.value ? [{
	key: 'overview',
	title: i18n.ts.overview,
	icon: 'ti ti-info-circle',
}, {
	key: 'raw',
	title: 'Raw',
	icon: 'ti ti-code',
}] : [{
	key: 'overview',
	title: i18n.ts.overview,
	icon: 'ti ti-info-circle',
}, {
	key: 'roles',
	title: i18n.ts.roles,
	icon: 'ti ti-badges',
}, {
	key: 'announcements',
	title: i18n.ts.announcements,
	icon: 'ti ti-speakerphone',
}, {
	key: 'drive',
	title: i18n.ts.drive,
	icon: 'ti ti-cloud',
}, {
	key: 'chart',
	title: i18n.ts.charts,
	icon: 'ti ti-chart-line',
}, {
	key: 'raw',
	title: 'Raw',
	icon: 'ti ti-code',
}]);

definePage(() => ({
	title: user.value ? acct(user.value) : i18n.ts.userInfo,
	icon: 'ti ti-user-exclamation',
}));
</script>

<style lang="scss" scoped>
.aeakzknw {
	display: flex;
	align-items: center;

	> .avatar {
		display: block;
		width: 64px;
		height: 64px;
		margin-right: 16px;
	}

	> .body {
		flex: 1;
		overflow: hidden;

		> .name {
			display: block;
			width: 100%;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		> .sub {
			display: block;
			width: 100%;
			font-size: 85%;
			opacity: 0.7;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		> .state {
			display: flex;
			gap: 8px;
			flex-wrap: wrap;
			margin-top: 4px;

			&:empty {
				display: none;
			}

			> .suspended, > .silenced, > .moderator {
				display: inline-block;
				border: solid 1px;
				border-radius: var(--MI-radius-sm);
				padding: 2px 6px;
				font-size: 85%;
			}

			> .suspended {
				color: var(--MI_THEME-error);
				border-color: var(--MI_THEME-error);
			}

			> .silenced {
				color: var(--MI_THEME-warn);
				border-color: var(--MI_THEME-warn);
			}

			> .moderator {
				color: var(--MI_THEME-success);
				border-color: var(--MI_THEME-success);
			}
		}
	}
}

.cmhjzshm {
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

.casdwq {
	.silenced {
		color: var(--MI_THEME-warn);
		border-color: var(--MI_THEME-warn);
	}

	.moderator {
		color: var(--MI_THEME-success);
		border-color: var(--MI_THEME-success);
	}
}
</style>

<style lang="scss" module>
.ip {
	display: flex;
	word-break: break-all;

	> :global(.date) {
		opacity: 0.7;
	}

	> :global(.ip) {
		margin-left: auto;
	}
}

.roleItemMain {
	display: flex;
}

.role {
	flex: 1;
	min-width: 0;
	margin-right: 8px;
}

.roleItemSub {
	padding: 6px 12px;
	font-size: 85%;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.75);
}

.roleUnassign {
	width: 32px;
	height: 32px;
	margin-left: 8px;
	align-self: center;
}

.announcementItem {
	display: flex;
	padding: 8px 12px;
	border-radius: var(--MI-radius-sm);
	cursor: pointer;
}

// Sync with instance-info.vue
.buttonStrip {
	margin: calc(var(--MI-margin) / 2 * -1);

	>* {
		margin: calc(var(--MI-margin) / 2);
	}
}

.rawFolderHeader {
	display: flex;
	flex-direction: row;
	justify-content: space-between;
	align-items: flex-start;
	padding: var(--MI-marginHalf);
	gap: var(--MI-marginHalf);
}
</style>
