<!--
SPDX-FileCopyrightText: Linca
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<MkInfo>
		<p> 这些设置是 Sharkey Stelpolva 添加的设置，是普通Sharkey实例没有的。</p>
		<p> These settings are added by Sharkey Stelpolva and are not available in normal Sharkey instances. </p>
	</MkInfo>

	<FormSection first>
		<template #label>{{ i18n.ts.appearance }}</template>

		<div class="_gaps_m">
			<div class="_gaps_s">
				<MkSelect v-model="defaultFont.fontFace">
					<template #label>默认字体 Default Font</template>
					<template #caption>
						<p>Some Chinese font files are large, please wait for a while for the font to load after switching.</p>
						<p>一些中文字体文件较大，请切换字体后等待一会儿字体文件的加载。</p>
						<p>为了更好的体验，仅支持简体的峄山碑篆体和仅支持繁体的崇羲篆體会互相补充。</p>
					</template>
					<option
						v-for="item in defaultFont.fontList"
						:key="item.id"
						:value="item.id"
					>
						{{ item.name }}
					</option>
				</MkSelect>
				<MkRadios v-if="defaultFont.availableTypes.length > 0" v-model="defaultFont.fontFaceType">
					<template #label>字体属性 Font Type</template>
					<template #caption>
						选择字体的子属性
					</template>
					<option
						v-for="item in defaultFont.availableTypes"
						:key="item.id"
						:value="item.id"
					>
						{{ item.name }}
					</option>
				</MkRadios>
			</div>
			<div class="_gaps_s">
				<MkSwitch v-model="stpvDisableAllReactions">
					前端禁用表情回应功能 Disable all reactions
					<template #caption>该设置只是前端更改，别人仍然可以对你的帖子做出回应。只对Sharkey风格Note生效</template>
				</MkSwitch>
			</div>
		</div>
	</FormSection>

	<FormSection>
		<template #label>{{ i18n.ts.behavior }}</template>
		<div class="_gaps_m">
			<div class="_gaps_s">
				<MkRadios v-model="autoSpacingBehaviour">
					<template #label>自动空格</template>
					<option :value="null">{{ i18n.ts.disabled }}</option>
					<option value="all">{{ i18n.ts.all }}</option>
					<option value="special">智能</option>
					<template #caption>在帖子正文的中文与英文之间自动加入缺失的空格。当选择“智能”时，一部分通常认为是混合词的（B超，X光等）会被保留</template>
				</MkRadios>
			</div>
		</div>
	</FormSection>

	<FormSection>
		<template #label>{{ i18n.ts.operations }}</template>
		<div class="_gaps_m">
			<div class="_gaps_s">
				<MkButton link to="/make-private-many"><i class="ph-eye-slash ph-bold ph-lg"></i> {{ i18n.ts.makePrivate.bulkText }}</MkButton>
			</div>
		</div>
	</FormSection>
</div>
</template>

<script lang="ts" setup>
import { computed, watch } from 'vue';
import MkSwitch from '@/components/MkSwitch.vue';
import FormLink from '@/components/form/link.vue';
import MkFolder from '@/components/MkFolder.vue';
import FormInfo from '@/components/MkInfo.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import MkButton from '@/components/MkButton.vue';
import MkRadios from '@/components/MkRadios.vue';
import MkSelect from '@/components/MkSelect.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/scripts/misskey-api.js';
import { defaultStore } from '@/store.js';
import { signout, signinRequired } from '@/account.js';
import { i18n } from '@/i18n.js';
import { definePageMetadata } from '@/scripts/page-metadata.js';
import { unisonReload } from '@/scripts/unison-reload.js';
import FormSection from '@/components/form/section.vue';
import MkInfo from '@/components/MkInfo.vue';
import { getDefaultFontSettings } from '@/scripts/font-settings';

// Uncomment the next line when signInRequired settings added
// const $i = signinRequired();

const defaultFont = getDefaultFontSettings();
console.log(defaultFont);

const autoSpacingBehaviour = computed(defaultStore.makeGetterSetter('chineseAutospacing'));
const stpvDisableAllReactions = computed(defaultStore.makeGetterSetter('stpvDisableAllReactions'));

// const headerActions = computed(() => []);

// const headerTabs = computed(() => []);

definePageMetadata(() => ({
	title: 'Sharkey Stelpolva Plus Settings',
	icon: 'ti ti-dots',
}));
</script>

