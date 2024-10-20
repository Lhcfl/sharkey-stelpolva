<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><XHeader :actions="headerActions" :tabs="headerTabs"/></template>
	<MkSpacer :contentMax="700" :marginMin="16" :marginMax="32">
		<div class="_gaps_m">
			<XBotProtection/>

			<MkFolder>
				<template #label>Active Email Validation</template>
				<template v-if="emailValidationForm.savedState.enableActiveEmailValidation" #suffix>Enabled</template>
				<template v-else #suffix>Disabled</template>
				<template v-if="emailValidationForm.modified.value" #footer>
					<MkFormFooter :form="emailValidationForm"/>
				</template>

				<div class="_gaps_m">
					<span>{{ i18n.ts.activeEmailValidationDescription }}</span>
					<MkSwitch v-model="emailValidationForm.state.enableActiveEmailValidation">
						<template #label>Enable</template>
					</MkSwitch>
					<MkSwitch v-model="emailValidationForm.state.enableVerifymailApi">
						<template #label>Use Verifymail.io API</template>
					</MkSwitch>
					<MkInput v-model="emailValidationForm.state.verifymailAuthKey">
						<template #prefix><i class="ti ti-key"></i></template>
						<template #label>Verifymail.io API Auth Key</template>
					</MkInput>
					<MkSwitch v-model="emailValidationForm.state.enableTruemailApi">
						<template #label>Use TrueMail API</template>
					</MkSwitch>
					<MkInput v-model="emailValidationForm.state.truemailInstance">
						<template #prefix><i class="ti ti-key"></i></template>
						<template #label>TrueMail API Instance</template>
					</MkInput>
					<MkInput v-model="emailValidationForm.state.truemailAuthKey">
						<template #prefix><i class="ti ti-key"></i></template>
						<template #label>TrueMail API Auth Key</template>
					</MkInput>
				</div>
			</MkFolder>

			<MkFolder>
				<template #label>Banned Email Domains</template>
				<template v-if="bannedEmailDomainsForm.modified.value" #footer>
					<MkFormFooter :form="bannedEmailDomainsForm"/>
				</template>

				<div class="_gaps_m">
					<MkTextarea v-model="bannedEmailDomainsForm.state.bannedEmailDomains">
						<template #label>Banned Email Domains List</template>
					</MkTextarea>
				</div>
			</MkFolder>

			<MkFolder>
				<template #label>Log IP address</template>
				<template v-if="ipLoggingForm.savedState.enableIpLogging" #suffix>Enabled</template>
				<template v-else #suffix>Disabled</template>
				<template v-if="ipLoggingForm.modified.value" #footer>
					<MkFormFooter :form="ipLoggingForm"/>
				</template>

				<div class="_gaps_m">
					<MkSwitch v-model="ipLoggingForm.state.enableIpLogging">
						<template #label>Enable</template>
					</MkSwitch>
				</div>
			</MkFolder>
		</div>
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
import MkRange from '@/components/MkRange.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { useForm } from '@/scripts/use-form.js';
import MkFormFooter from '@/components/MkFormFooter.vue';

const meta = await misskeyApi('admin/meta');

const ipLoggingForm = useForm({
	enableIpLogging: meta.enableIpLogging,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		enableIpLogging: state.enableIpLogging,
	});
	fetchInstance(true);
});

const emailValidationForm = useForm({
	enableActiveEmailValidation: meta.enableActiveEmailValidation,
	enableVerifymailApi: meta.enableVerifymailApi,
	verifymailAuthKey: meta.verifymailAuthKey,
	enableTruemailApi: meta.enableTruemailApi,
	truemailInstance: meta.truemailInstance,
	truemailAuthKey: meta.truemailAuthKey,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		enableActiveEmailValidation: state.enableActiveEmailValidation,
		enableVerifymailApi: state.enableVerifymailApi,
		verifymailAuthKey: state.verifymailAuthKey,
		enableTruemailApi: state.enableTruemailApi,
		truemailInstance: state.truemailInstance,
		truemailAuthKey: state.truemailAuthKey,
	});
	fetchInstance(true);
});

const bannedEmailDomainsForm = useForm({
	bannedEmailDomains: meta.bannedEmailDomains?.join('\n') || '',
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		bannedEmailDomains: state.bannedEmailDomains.split('\n'),
	});
	fetchInstance(true);
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePageMetadata(() => ({
	title: i18n.ts.security,
	icon: 'ti ti-lock',
}));
</script>
