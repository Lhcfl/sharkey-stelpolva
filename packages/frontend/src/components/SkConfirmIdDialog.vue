<!--
SPDX-FileCopyrightText: marie and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialog" :width="500" :height="550" :with-close-button="false" @closed="emit('closed')">
	<template #header>
		<i class="ph-warning-circle ph-bold ph-lg" style="margin-right: 0.5em;"></i>
		<b>Confirm your Identity</b>
	</template>
	<Transition
		mode="out-in"
		:enterActiveClass="$style.transition_x_enterActive"
		:leaveActiveClass="$style.transition_x_leaveActive"
		:enterFromClass="$style.transition_x_enterFrom"
		:leaveToClass="$style.transition_x_leaveTo"
	>
		<template v-if="page === 0">
			<div :class="$style.centerPage">
				<MkSpacer :marginMin="20" :marginMax="28">
					<div class="_gaps" style="text-align: center;">
						<div style="font-size: 110%;">{{ i18n.ts._stripeAgeCheck.startText }}</div>
						<div class="_buttonsCenter">
							<MkButton rounded primary @click="startCheck()">{{ i18n.ts._stripeAgeCheck._buttons.start }}</MkButton>
						</div>
					</div>
				</MkSpacer>
			</div>
		</template>
		<template v-else-if="page === 1">
			<div :class="$style.centerPage">
				<MkSpacer :marginMin="20" :marginMax="28">
					<div class="_gaps" style="text-align: center;">
						<div style="font-size: 110%;">{{ i18n.ts._stripeAgeCheck.beginProcess }}</div>
						<div class="_buttonsCenter">
							<MkButton rounded primary @click="openCheck()">{{ i18n.ts._stripeAgeCheck._buttons.openInNewTab }}</MkButton>
						</div>
					</div>
				</MkSpacer>
			</div>
		</template>
		<template v-else-if="page === 2">
			<div :class="$style.centerPage">
				<MkSpacer :marginMin="20" :marginMax="28">
					<div class="_gaps" style="text-align: center;">
						<div style="font-size: 110%;">{{ i18n.ts._stripeAgeCheck.endProcess }}</div>
						<div class="_buttonsCenter">
							<MkButton rounded primary @click="confirmFinish()">{{ i18n.ts._stripeAgeCheck._buttons.confirmFinish }}</MkButton>
						</div>
					</div>
				</MkSpacer>
			</div>
		</template>
	</Transition>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { shallowRef, ref } from 'vue';
import { misskeyApi } from '@/scripts/misskey-api.js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { $i } from '@/account.js';

const dialog = shallowRef<InstanceType<typeof MkModalWindow>>();
const url = ref('');
const page = ref(0);

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

async function startCheck() {
	// Fail safe as it seems Misskey's frontend tends to not update the $i properly so on first reload the dialog may pop up again if reloaded too fast.
	if ($i && !$i.idCheckRequired) dialog.value?.close();
	await misskeyApi('stripe/create-verify-session').then(res => {
		url.value = res.url;
		page.value = page.value + 1;
	})
}

function openCheck() {
	window.open(url.value, '_blank', 'noopener');
	page.value = page.value + 1;
}

async function confirmFinish() {
	await misskeyApi('i').then(res => {
		if (!res.idCheckRequired && $i) {
			$i.idCheckRequired = res.idCheckRequired;
			$i.idVerified = res.idVerified;
			dialog.value?.close();
		}
	})
}
</script>

<style lang="scss" module>
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity 0.3s cubic-bezier(0,0,.35,1), transform 0.3s cubic-bezier(0,0,.35,1);
}
.transition_x_enterFrom {
	opacity: 0;
	transform: translateX(50px);
}
.transition_x_leaveTo {
	opacity: 0;
	transform: translateX(-50px);
}

.centerPage {
	display: flex;
	justify-content: center;
	align-items: center;
	height: 100cqh;
	padding-bottom: 30px;
	box-sizing: border-box;
}

.pageRoot {
	display: flex;
	flex-direction: column;
	min-height: 100%;
}

.pageMain {
	flex-grow: 1;
}
</style>
