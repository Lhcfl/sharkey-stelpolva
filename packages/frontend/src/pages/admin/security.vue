<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><XHeader :actions="headerActions" :tabs="headerTabs"/></template>
	<MkSpacer :contentMax="700" :marginMin="16" :marginMax="32">
		<FormSuspense :p="init">
			<div class="_gaps_m">
				<MkFolder>
					<template #icon><i class="ti ti-shield"></i></template>
					<template #label>{{ i18n.ts.botProtection }}</template>
					<template v-if="enableHcaptcha" #suffix>hCaptcha</template>
					<template v-else-if="enableMcaptcha" #suffix>mCaptcha</template>
					<template v-else-if="enableRecaptcha" #suffix>reCAPTCHA</template>
					<template v-else-if="enableTurnstile" #suffix>Turnstile</template>
					<template v-else #suffix>{{ i18n.ts.none }} ({{ i18n.ts.notRecommended }})</template>

					<XBotProtection/>
				</MkFolder>

				<MkFolder>
					<template #label>Active Email Validation</template>
					<template v-if="enableActiveEmailValidation" #suffix>Enabled</template>
					<template v-else #suffix>Disabled</template>

					<div class="_gaps_m">
						<span>{{ i18n.ts.activeEmailValidationDescription }}</span>
						<MkSwitch v-model="enableActiveEmailValidation">
							<template #label>Enable</template>
						</MkSwitch>
						<MkSwitch v-model="enableVerifymailApi">
							<template #label>Use Verifymail.io API</template>
						</MkSwitch>
						<MkInput v-model="verifymailAuthKey">
							<template #prefix><i class="ti ti-key"></i></template>
							<template #label>Verifymail.io API Auth Key</template>
						</MkInput>
						<MkSwitch v-model="enableTruemailApi">
							<template #label>Use TrueMail API</template>
						</MkSwitch>
						<MkInput v-model="truemailInstance">
							<template #prefix><i class="ti ti-key"></i></template>
							<template #label>TrueMail API Instance</template>
						</MkInput>
						<MkInput v-model="truemailAuthKey">
							<template #prefix><i class="ti ti-key"></i></template>
							<template #label>TrueMail API Auth Key</template>
						</MkInput>
						<MkButton primary @click="save"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder>
					<template #label>Banned Email Domains</template>

					<div class="_gaps_m">
						<MkTextarea v-model="bannedEmailDomains">
							<template #label>Banned Email Domains List</template>
						</MkTextarea>
						<MkButton primary @click="save"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder>
					<template #label>Log IP address</template>
					<template v-if="enableIpLogging" #suffix>Enabled</template>
					<template v-else #suffix>Disabled</template>

					<div class="_gaps_m">
						<MkSwitch v-model="enableIpLogging" @update:modelValue="save">
							<template #label>Enable</template>
						</MkSwitch>
					</div>
				</MkFolder>
			</div>
		</FormSuspense>
	</MkSpacer>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import XBotProtection from './bot-protection.vue';
import XHeader from './_header_.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import FormSuspense from '@/components/form/suspense.vue';
import MkRange from '@/components/MkRange.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';

const enableHcaptcha = ref<boolean>(false);
const enableMcaptcha = ref<boolean>(false);
const enableRecaptcha = ref<boolean>(false);
const enableTurnstile = ref<boolean>(false);
const enableIpLogging = ref<boolean>(false);
const enableActiveEmailValidation = ref<boolean>(false);
const enableVerifymailApi = ref<boolean>(false);
const verifymailAuthKey = ref<string | null>(null);
const enableTruemailApi = ref<boolean>(false);
const truemailInstance = ref<string | null>(null);
const truemailAuthKey = ref<string | null>(null);
const bannedEmailDomains = ref<string>('');

async function init() {
	const meta = await misskeyApi('admin/meta');
	enableHcaptcha.value = meta.enableHcaptcha;
	enableMcaptcha.value = meta.enableMcaptcha;
	enableRecaptcha.value = meta.enableRecaptcha;
	enableTurnstile.value = meta.enableTurnstile;
	enableIpLogging.value = meta.enableIpLogging;
	enableActiveEmailValidation.value = meta.enableActiveEmailValidation;
	enableVerifymailApi.value = meta.enableVerifymailApi;
	verifymailAuthKey.value = meta.verifymailAuthKey;
	enableTruemailApi.value = meta.enableTruemailApi;
	truemailInstance.value = meta.truemailInstance;
	truemailAuthKey.value = meta.truemailAuthKey;
	bannedEmailDomains.value = meta.bannedEmailDomains?.join('\n') || '';
}

function save() {
	os.apiWithDialog('admin/update-meta', {
		enableIpLogging: enableIpLogging.value,
		enableActiveEmailValidation: enableActiveEmailValidation.value,
		enableVerifymailApi: enableVerifymailApi.value,
		verifymailAuthKey: verifymailAuthKey.value,
		enableTruemailApi: enableTruemailApi.value,
		truemailInstance: truemailInstance.value,
		truemailAuthKey: truemailAuthKey.value,
		bannedEmailDomains: bannedEmailDomains.value.split('\n'),
	}).then(() => {
		fetchInstance(true);
	});
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePageMetadata(() => ({
	title: i18n.ts.security,
	icon: 'ti ti-lock',
}));
</script>
