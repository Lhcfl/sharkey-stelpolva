<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_m">
	<div :class="$style.banner" :style="{ backgroundImage: `url(${ instance.bannerUrl })` }">
		<div style="overflow: clip;">
			<img :src="instance.sidebarLogoUrl ?? instance.iconUrl ?? '/favicon.ico'" alt="" :class="$style.bannerIcon"/>
			<div :class="$style.bannerName">
				<b>{{ instance.name ?? host }}</b>
			</div>
		</div>
	</div>

	<MkKeyValue>
		<template #key>{{ i18n.ts.about }}</template>
		<template #value><div v-html="sanitizeHtml(instance.about || instance.description)"></div></template>
	</MkKeyValue>

	<FormSection>
		<div class="_gaps_m">
			<MkKeyValue :copy="version">
				<!-- TODO translate -->
				<template #key>Sharkey</template>
				<template #value>{{ version }}</template>
			</MkKeyValue>
			<div v-html="i18n.tsx.poweredByMisskeyDescription({ name: instance.name ?? host })">
			</div>
			<FormLink to="/about-sharkey">
				<template #icon><i class="ti ti-info-circle"></i></template>
				{{ i18n.ts.aboutMisskey }}
			</FormLink>
			<FormLink v-if="instance.repositoryUrl || instance.providesTarball" :to="instance.repositoryUrl || `/tarball/sharkey-${version}.tar.gz`" external>
				<template #icon><i class="ti ti-code"></i></template>
				{{ i18n.ts.sourceCode }}
			</FormLink>
			<MkInfo v-else warn>
				{{ i18n.ts.sourceCodeIsNotYetProvided }}
			</MkInfo>
		</div>
	</FormSection>

	<FormSection>
		<div class="_gaps_m">
			<FormSplit>
				<MkKeyValue :copy="instance.maintainerName">
					<template #key>{{ i18n.ts.administrator }}</template>
					<template #value>
						<template v-if="instance.maintainerName">{{ instance.maintainerName }}</template>
						<span v-else style="opacity: 0.7;">({{ i18n.ts.none }})</span>
					</template>
				</MkKeyValue>
				<MkKeyValue :copy="instance.maintainerEmail">
					<template #key>{{ i18n.ts.contact }}</template>
					<template #value>
						<template v-if="instance.maintainerEmail">{{ instance.maintainerEmail }}</template>
						<span v-else style="opacity: 0.7;">({{ i18n.ts.none }})</span>
					</template>
				</MkKeyValue>
				<MkKeyValue>
					<template #key>{{ i18n.ts.inquiry }}</template>
					<template #value>
						<MkLink v-if="instance.inquiryUrl" :url="instance.inquiryUrl" target="_blank">{{ instance.inquiryUrl }}</MkLink>
						<span v-else style="opacity: 0.7;">({{ i18n.ts.none }})</span>
					</template>
				</MkKeyValue>
			</FormSplit>
			<FormLink v-if="instance.impressumUrl" :to="instance.impressumUrl" external>
				<template #icon><i class="ti ti-user-shield"></i></template>
				{{ i18n.ts.impressum }}
			</FormLink>
			<div class="_gaps_s">
				<FormLink v-if="instance.impressumUrl" :to="instance.impressumUrl" external>
					<template #icon><i class="ti ti-user-shield"></i></template>
					<template #default>{{ i18n.ts.impressum }}</template>
				</FormLink>
				<MkFolder v-if="instance.serverRules.length > 0">
					<template #icon><i class="ti ti-checkup-list"></i></template>
					<template #label>{{ i18n.ts.serverRules }}</template>
					<ol class="_gaps_s" :class="$style.rules">
						<li v-for="item in instance.serverRules" :key="item" :class="$style.rule">
							<div :class="$style.ruleText" v-html="sanitizeHtml(item)"></div>
						</li>
					</ol>
				</MkFolder>
				<FormLink v-if="instance.tosUrl" :to="instance.tosUrl" external>
					<template #icon><i class="ti ti-license"></i></template>
					<template #default>{{ i18n.ts.termsOfService }}</template>
				</FormLink>
				<FormLink v-if="instance.privacyPolicyUrl" :to="instance.privacyPolicyUrl" external>
					<template #icon><i class="ti ti-shield-lock"></i></template>
					<template #default>{{ i18n.ts.privacyPolicy }}</template>
				</FormLink>
				<FormLink v-if="instance.feedbackUrl" :to="instance.feedbackUrl" external>
					<template #icon><i class="ti ti-message"></i></template>
					<template #default>{{ i18n.ts.feedback }}</template>
				</FormLink>
			</div>
		</div>
	</FormSection>

	<FormSuspense v-slot="{ result: stats }" :p="initStats">
		<FormSection v-if="stats">
			<template #label>{{ i18n.ts.statistics }}</template>
			<FormSplit>
				<MkKeyValue>
					<template #key>{{ i18n.ts.users }}</template>
					<template #value>{{ number(stats.originalUsersCount) }}</template>
				</MkKeyValue>
				<MkKeyValue>
					<template #key>{{ i18n.ts.notes }}</template>
					<template #value>{{ number(stats.originalNotesCount) }}</template>
				</MkKeyValue>
			</FormSplit>
		</FormSection>
	</FormSuspense>

	<FormSection v-if="sponsors.length > 0">
		<template #label>Our lovely Sponsors</template>
		<div :class="$style.contributors">
			<span
				v-for="(sponsor, i) of sponsors"
				:key="i"
				style="margin-bottom: 0.5rem;"
			>
				<a :href="sponsor.website || sponsor.profile" target="_blank" :class="$style.contributor">
					<img :src="sponsor.image || `https://ui-avatars.com/api/?background=0D8ABC&color=fff&name=${sponsor.name}`" :class="$style.contributorAvatar">
					<span :class="$style.contributorUsername">{{ sponsor.name }}</span>
				</a>
			</span>
		</div>
	</FormSection>

	<FormSection>
		<template #label>Well-known resources</template>
		<div class="_gaps_s">
			<FormLink to="/.well-known/host-meta" external>host-meta</FormLink>
			<FormLink to="/.well-known/host-meta.json" external>host-meta.json</FormLink>
			<FormLink to="/.well-known/nodeinfo" external>nodeinfo</FormLink>
			<FormLink to="/robots.txt" external>robots.txt</FormLink>
			<FormLink to="/manifest.json" external>manifest.json</FormLink>
		</div>
	</FormSection>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { host, version } from '@@/js/config.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import number from '@/filters/number.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import FormLink from '@/components/form/link.vue';
import FormSection from '@/components/form/section.vue';
import FormSplit from '@/components/form/split.vue';
import FormSuspense from '@/components/form/suspense.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import MkLink from '@/components/MkLink.vue';
import sanitizeHtml from '@/utility/sanitize-html.js';

const sponsors = ref<{ name: string, image: string | null, website: string | null, profile: string }[]>([]);

const initStats = () => misskeyApi('stats', {});
await misskeyApi('sponsors', { instance: true }).then((res) => sponsors.value = res.sponsor_data);
</script>

<style lang="scss" module>
.banner {
	text-align: center;
	border-radius: var(--MI-radius);
	overflow: clip;
	background-color: var(--MI_THEME-panel);
	background-size: cover;
	background-position: center center;
}

.bannerIcon {
	display: block;
	margin: 16px auto 0 auto;
	max-height: 96px;
	border-radius: var(--MI-radius-sm);;
}

.bannerName {
	display: block;
	padding: 16px;
	color: #fff;
	text-shadow: 0 0 8px #000;
	background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
}

.rules {
	counter-reset: item;
	list-style: none;
	padding: 0;
	margin: 0;
}

.rule {
	display: flex;
	gap: 8px;
	word-break: break-word;

	&::before {
		flex-shrink: 0;
		display: flex;
		position: sticky;
		top: calc(var(--MI-stickyTop, 0px) + 8px);
		counter-increment: item;
		content: counter(item);
		width: 32px;
		height: 32px;
		line-height: 32px;
		background-color: var(--MI_THEME-accentedBg);
		color: var(--MI_THEME-accent);
		font-size: 13px;
		font-weight: bold;
		align-items: center;
		justify-content: center;
		border-radius: var(--MI-radius-ellipse);
	}
}

.ruleText {
	padding-top: 6px;
}

.contributors {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	grid-gap: 12px;
}

.contributor {
	display: flex;
	align-items: center;
	padding: 12px;
	background: var(--MI_THEME-buttonBg);
	border-radius: var(--MI-radius-sm);

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-buttonHoverBg);
	}

	&.active {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.contributorAvatar {
	width: 30px;
	border-radius: var(--MI-radius-full);
}

.contributorUsername {
	margin-left: 12px;
}
</style>
