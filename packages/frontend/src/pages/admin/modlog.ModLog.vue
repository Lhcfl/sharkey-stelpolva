<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #label>
		<b
			:class="{
				[$style.logGreen]: [
					'createRole',
					'addCustomEmoji',
					'createGlobalAnnouncement',
					'createUserAnnouncement',
					'createAd',
					'createInvitation',
					'createAvatarDecoration',
					'createSystemWebhook',
					'createAbuseReportNotificationRecipient',
					'createAccount',
					'importCustomEmojis',
					'createPromo',
					'addRelay',
				].includes(log.type),
				[$style.logYellow]: [
					'markSensitiveDriveFile',
					'resetPassword',
					'setMandatoryCW',
					'suspendRemoteInstance',
					'setRemoteInstanceNSFW',
					'unsetRemoteInstanceNSFW',
					'rejectRemoteInstanceReports',
					'acceptRemoteInstanceReports',
					'rejectQuotesUser',
					'acceptQuotesUser',
					'nsfwUser',
					'unNsfwUser',
					'silenceUser',
					'unSilenceUser',
					'updateCustomEmojis',
				].includes(log.type),
				[$style.logRed]: [
					'suspend',
					'approve',
					'decline',
					'deleteRole',
					'deleteGlobalAnnouncement',
					'deleteUserAnnouncement',
					'deleteCustomEmoji',
					'deleteNote',
					'deleteDriveFile',
					'deleteAd',
					'deleteAvatarDecoration',
					'deleteSystemWebhook',
					'deleteAbuseReportNotificationRecipient',
					'deleteAccount',
					'deletePage',
					'deleteFlash',
					'deleteGalleryPost',
					'deleteChatRoom',
					'clearUserFiles',
					'clearRemoteFiles',
					'clearOwnerlessFiles',
					'clearInstanceFiles',
					'severFollowRelations',
					'removeRelay',
				].includes(log.type)
			}"
		>{{ i18n.ts._moderationLogTypes[log.type] }}</b>
		<span v-if="log.type === 'updateUserNote'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'suspend'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'approve'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'rejectQuotesUser'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'acceptQuotesUser'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'rejectQuotesInstance'">: {{ log.info.host }}</span>
		<span v-else-if="log.type === 'acceptQuotesInstance'">: {{ log.info.host }}</span>
		<span v-else-if="log.type === 'decline'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'unsuspend'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'resetPassword'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'setMandatoryCW'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'assignRole'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }} <i class="ti ti-arrow-right"></i> {{ log.info.roleName }}</span>
		<span v-else-if="log.type === 'unassignRole'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }} <i class="ti ti-equal-not"></i> {{ log.info.roleName }}</span>
		<span v-else-if="log.type === 'createRole'">: {{ log.info.role.name }}</span>
		<span v-else-if="log.type === 'updateRole'">: {{ log.info.before.name }}</span>
		<span v-else-if="log.type === 'deleteRole'">: {{ log.info.role.name }}</span>
		<span v-else-if="log.type === 'addCustomEmoji'">: {{ log.info.emoji.name }}</span>
		<span v-else-if="log.type === 'updateCustomEmoji'">: {{ log.info.before.name }}</span>
		<span v-else-if="log.type === 'deleteCustomEmoji'">: {{ log.info.emoji.name }}</span>
		<span v-else-if="log.type === 'markSensitiveDriveFile'">: @{{ log.info.fileUserUsername }}{{ log.info.fileUserHost ? '@' + log.info.fileUserHost : '' }}</span>
		<span v-else-if="log.type === 'unmarkSensitiveDriveFile'">: @{{ log.info.fileUserUsername }}{{ log.info.fileUserHost ? '@' + log.info.fileUserHost : '' }}</span>
		<span v-else-if="log.type === 'suspendRemoteInstance'">: {{ log.info.host }}</span>
		<span v-else-if="log.type === 'unsuspendRemoteInstance'">: {{ log.info.host }}</span>
		<span v-else-if="log.type === 'setRemoteInstanceNSFW'">: {{ log.info.host }}</span>
		<span v-else-if="log.type === 'unsetRemoteInstanceNSFW'">: {{ log.info.host }}</span>
		<span v-else-if="log.type === 'rejectRemoteInstanceReports'">: {{ log.info.host }}</span>
		<span v-else-if="log.type === 'acceptRemoteInstanceReports'">: {{ log.info.host }}</span>
		<span v-else-if="log.type === 'createGlobalAnnouncement'">: {{ log.info.announcement.title }}</span>
		<span v-else-if="log.type === 'updateGlobalAnnouncement'">: {{ log.info.before.title }}</span>
		<span v-else-if="log.type === 'deleteGlobalAnnouncement'">: {{ log.info.announcement.title }}</span>
		<span v-else-if="log.type === 'createUserAnnouncement'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'updateUserAnnouncement'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'deleteUserAnnouncement'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'deleteNote'">: @{{ log.info.noteUserUsername }}{{ log.info.noteUserHost ? '@' + log.info.noteUserHost : '' }}</span>
		<span v-else-if="log.type === 'deleteDriveFile'">: @{{ log.info.fileUserUsername }}{{ log.info.fileUserHost ? '@' + log.info.fileUserHost : '' }}</span>
		<span v-else-if="log.type === 'createAvatarDecoration'">: {{ log.info.avatarDecoration.name }}</span>
		<span v-else-if="log.type === 'updateAvatarDecoration'">: {{ log.info.before.name }}</span>
		<span v-else-if="log.type === 'deleteAvatarDecoration'">: {{ log.info.avatarDecoration.name }}</span>
		<span v-else-if="log.type === 'createSystemWebhook'">: {{ log.info.webhook.name }}</span>
		<span v-else-if="log.type === 'updateSystemWebhook'">: {{ log.info.before.name }}</span>
		<span v-else-if="log.type === 'deleteSystemWebhook'">: {{ log.info.webhook.name }}</span>
		<span v-else-if="log.type === 'createAbuseReportNotificationRecipient'">: {{ log.info.recipient.name }}</span>
		<span v-else-if="log.type === 'updateAbuseReportNotificationRecipient'">: {{ log.info.before.name }}</span>
		<span v-else-if="log.type === 'deleteAbuseReportNotificationRecipient'">: {{ log.info.recipient.name }}</span>
		<span v-else-if="log.type === 'deleteAccount'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'deletePage'">: @{{ log.info.pageUserUsername }}</span>
		<span v-else-if="log.type === 'deleteFlash'">: @{{ log.info.flashUserUsername }}</span>
		<span v-else-if="log.type === 'deleteGalleryPost'">: @{{ log.info.postUserUsername }}</span>
		<span v-else-if="log.type === 'deleteChatRoom'">: @{{ log.info.room.name }}</span>
		<span v-else-if="log.type === 'clearUserFiles'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'nsfwUser'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'unNsfwUser'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'silenceUser'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'unSilenceUser'">: @{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</span>
		<span v-else-if="log.type === 'createAccount'">: @{{ log.info.userUsername }}</span>
		<span v-else-if="log.type === 'clearOwnerlessFiles'">: {{ log.info.count }}</span>
		<span v-else-if="log.type === 'importCustomEmojis'">: {{ log.info.fileName }}</span>
		<span v-else-if="log.type === 'clearInstanceFiles'">: {{ log.info.host }}</span>
		<span v-else-if="log.type === 'severFollowRelations'">: {{ log.info.host }}</span>
		<span v-else-if="log.type === 'createPromo'">: @{{ log.info.noteUserUsername }}{{ log.info.noteUserHost ? '@' + log.info.noteUserHost : '' }}</span>
		<span v-else-if="log.type === 'addRelay'">: {{ log.info.inbox }}</span>
		<span v-else-if="log.type === 'removeRelay'">: {{ log.info.inbox }}</span>
	</template>
	<template #icon>
		<i v-if="log.type === 'updateServerSettings'" class="ti ti-settings"></i>
		<i v-else-if="log.type === 'updateUserNote'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'suspend'" class="ti ti-user-x"></i>
		<i v-else-if="log.type === 'unsuspend'" class="ti ti-user-check"></i>
		<i v-else-if="log.type === 'resetPassword'" class="ti ti-key"></i>
		<i v-else-if="log.type === 'assignRole'" class="ti ti-user-plus"></i>
		<i v-else-if="log.type === 'unassignRole'" class="ti ti-user-minus"></i>
		<i v-else-if="log.type === 'createRole'" class="ti ti-plus"></i>
		<i v-else-if="log.type === 'updateRole'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'deleteRole'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'addCustomEmoji'" class="ti ti-plus"></i>
		<i v-else-if="log.type === 'updateCustomEmoji'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'deleteCustomEmoji'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'markSensitiveDriveFile'" class="ti ti-eye-exclamation"></i>
		<i v-else-if="log.type === 'unmarkSensitiveDriveFile'" class="ti ti-eye"></i>
		<i v-else-if="log.type === 'suspendRemoteInstance'" class="ti ti-x"></i>
		<i v-else-if="log.type === 'unsuspendRemoteInstance'" class="ti ti-check"></i>
		<i v-else-if="log.type === 'createGlobalAnnouncement'" class="ti ti-plus"></i>
		<i v-else-if="log.type === 'updateGlobalAnnouncement'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'deleteGlobalAnnouncement'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'createUserAnnouncement'" class="ti ti-plus"></i>
		<i v-else-if="log.type === 'updateUserAnnouncement'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'deleteUserAnnouncement'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'deleteNote'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'deleteDriveFile'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'createAd'" class="ti ti-plus"></i>
		<i v-else-if="log.type === 'updateAd'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'deleteAd'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'createAvatarDecoration'" class="ti ti-plus"></i>
		<i v-else-if="log.type === 'updateAvatarDecoration'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'deleteAvatarDecoration'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'createSystemWebhook'" class="ti ti-plus"></i>
		<i v-else-if="log.type === 'updateSystemWebhook'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'deleteSystemWebhook'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'createAbuseReportNotificationRecipient'" class="ti ti-plus"></i>
		<i v-else-if="log.type === 'updateAbuseReportNotificationRecipient'" class="ti ti-pencil"></i>
		<i v-else-if="log.type === 'deleteAbuseReportNotificationRecipient'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'deleteAccount'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'deletePage'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'deleteFlash'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'deleteGalleryPost'" class="ti ti-trash"></i>
		<i v-else-if="log.type === 'deleteChatRoom'" class="ti ti-trash"></i>
	</template>
	<template #suffix>
		<MkTime :time="log.createdAt"/>
	</template>

	<div>
		<div style="display: flex; gap: var(--MI-margin); flex-wrap: wrap;">
			<div style="flex: 1;">{{ i18n.ts.moderator }}: <MkA :to="`/admin/user/${log.userId}`" class="_link">@{{ log.user?.username }}</MkA></div>
			<div style="flex: 1;">{{ i18n.ts.dateAndTime }}: <MkTime :time="log.createdAt" mode="detail"/></div>
		</div>

		<template v-if="log.type === 'updateServerSettings'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateUserNote'">
			<div>{{ i18n.ts.user }}: {{ log.info.userId }}</div>
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="log.info.before ?? ''" :newString="log.info.after ?? ''" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'suspend'">
			<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.userId}`" class="_link">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</MkA></div>
		</template>
		<template v-else-if="log.type === 'approve'">
			<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.userId}`" class="_link">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</MkA></div>
		</template>
		<template v-else-if="log.type === 'setMandatoryCW'">
			<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.userId}`" class="_link">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</MkA></div>
			<div :class="$style.diff">
				<CodeDiff :context="0" :hideHeader="true" :oldString="log.info.oldCW ?? ''" :newString="log.info.newCW ?? ''" maxHeight="150px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'unsuspend'">
			<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.userId}`" class="_link">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</MkA></div>
		</template>
		<template v-else-if="log.type === 'rejectQuotesUser'">
			<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.userId}`" class="_link">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</MkA></div>
		</template>
		<template v-else-if="log.type === 'acceptQuotesUser'">
			<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.userId}`" class="_link">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</MkA></div>
		</template>
		<template v-else-if="log.type === 'updateRole'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'assignRole'">
			<div>{{ i18n.ts.user }}: {{ log.info.userId }}</div>
			<div>{{ i18n.ts.role }}: {{ log.info.roleName }} [{{ log.info.roleId }}]</div>
		</template>
		<template v-else-if="log.type === 'unassignRole'">
			<div>{{ i18n.ts.user }}: {{ log.info.userId }}</div>
			<div>{{ i18n.ts.role }}: {{ log.info.roleName }} [{{ log.info.roleId }}]</div>
		</template>
		<template v-else-if="log.type === 'updateCustomEmoji'">
			<div>{{ i18n.ts.emoji }}: {{ log.info.emojiId }}</div>
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateAd'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateGlobalAnnouncement'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateUserAnnouncement'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateAvatarDecoration'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateRemoteInstanceNote'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="log.info.before ?? ''" :newString="log.info.after ?? ''" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateSystemWebhook'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateAbuseReportNotificationRecipient'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="JSON5.stringify(log.info.before, null, '\t')" :newString="JSON5.stringify(log.info.after, null, '\t')" language="javascript" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'updateAbuseReportNote'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="log.info.before ?? ''" :newString="log.info.after ?? ''" maxHeight="300px"/>
			</div>
		</template>
		<template v-else-if="log.type === 'clearUserFiles'">
			<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.userId}`" class="_link">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</MkA></div>
			<div>{{ i18n.ts.filesRemoved }}: {{ log.info.count }}</div>
		</template>
		<template v-else-if="log.type === 'nsfwUser'">
			<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.userId}`" class="_link">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</MkA></div>
		</template>
		<template v-else-if="log.type === 'unNsfwUser'">
			<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.userId}`" class="_link">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</MkA></div>
		</template>
		<template v-else-if="log.type === 'silenceUser'">
			<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.userId}`" class="_link">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</MkA></div>
		</template>
		<template v-else-if="log.type === 'unSilenceUser'">
			<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.userId}`" class="_link">@{{ log.info.userUsername }}{{ log.info.userHost ? '@' + log.info.userHost : '' }}</MkA></div>
		</template>
		<template v-else-if="log.type === 'createAccount'">
			<div>{{ i18n.ts.user }}: <MkA :to="`/admin/user/${log.info.userId}`" class="_link">@{{ log.info.userUsername }}</MkA></div>
		</template>
		<template v-else-if="log.type === 'clearOwnerlessFiles'">
			<div>{{ i18n.ts.filesRemoved }}: {{ log.info.count }}</div>
		</template>
		<template v-else-if="log.type === 'importCustomEmojis'">
			<div>{{ i18n.ts.fileImported }}: {{ log.info.fileName }}</div>
		</template>
		<template v-else-if="log.type === 'clearInstanceFiles'">
			<div>{{ i18n.ts.host }}: <MkA :to="`/instance-info/${log.info.host}`" class="_link">{{ log.info.host }}</MkA></div>
			<div>{{ i18n.ts.filesRemoved }}: {{ log.info.count }}</div>
		</template>
		<template v-else-if="log.type === 'severFollowRelations'">
			<div>{{ i18n.ts.host }}: <MkA :to="`/instance-info/${log.info.host}`" class="_link">{{ log.info.host }}</MkA></div>
		</template>
		<template v-else-if="log.type === 'createPromo'">
			<SkFetchNote :noteId="log.info.noteId"/>
		</template>
		<template v-else-if="log.type === 'addRelay'">
			<div>{{ i18n.ts.inboxUrl }}: {{ log.info.inbox }}</div>
		</template>
		<template v-else-if="log.type === 'removeRelay'">
			<div>{{ i18n.ts.inboxUrl }}: {{ log.info.inbox }}</div>
		</template>
		<template v-else-if="log.type === 'updateProxyAccountDescription'">
			<div :class="$style.diff">
				<CodeDiff :context="5" :hideHeader="true" :oldString="log.info.before ?? ''" :newString="log.info.after ?? ''" maxHeight="300px"/>
			</div>
		</template>

		<details>
			<summary>raw</summary>
			<pre>{{ JSON5.stringify(log, null, '\t') }}</pre>
		</details>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { CodeDiff } from 'v-code-diff';
import JSON5 from 'json5';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/MkFolder.vue';
import SkFetchNote from '@/components/SkFetchNote.vue';

const props = defineProps<{
	log: Misskey.entities.ModerationLog;
}>();
</script>

<style lang="scss" module>
.diff {
	background: #fff;
	color: #000;
	border-radius: var(--MI-radius-sm);
	overflow: clip;
}

.logYellow {
	color: var(--MI_THEME-warn);
}

.logRed {
	color: var(--MI_THEME-error);
}

.logGreen {
	color: var(--MI_THEME-success);
}
</style>
