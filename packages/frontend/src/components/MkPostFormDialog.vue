<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal
	ref="modal"
	:preferType="'dialog'"
	@click="modal?.close()"
	@closed="onModalClosed()"
	@esc="modal?.close()"
>
	<MkPostForm
		ref="form"
		:class="$style.form"
		v-bind="props"
		autofocus
		freezeAfterPosted
		@posted="onPosted"
		@cancel="onCancel"
		@esc="onCancel"
	/>
</MkModal>
</template>

<script lang="ts" setup>
import { useTemplateRef } from 'vue';
import type { PostFormProps } from '@/types/post-form.js';
import type * as Misskey from 'misskey-js';
import MkModal from '@/components/MkModal.vue';
import MkPostForm from '@/components/MkPostForm.vue';

const props = withDefaults(defineProps<PostFormProps & {
	fixed?: boolean;
	autofocus?: boolean;
	editId?: Misskey.entities.Note['id'];
}>(), {
	initialLocalOnly: undefined,
	editId: undefined,
});

const emit = defineEmits<{
	(ev: 'closed', cancelled: boolean): void;
}>();

const modal = useTemplateRef('modal');

function onPosted() {
	modal.value?.close({
		useSendAnimation: true,
	});
	emit('closed', false);
}

function onCancel() {
	// for some reason onModalClosed does not get called properly when closing the model through other functions.
	modal.value?.close();
	// emit is required so that the dialog gets properly disposed otherwise it will float around as a "zombie"
	emit('closed', true);
}

function onModalClosed() {
	emit('closed', true);
}
</script>

<style lang="scss" module>
.form {
	max-height: 100%;
	margin: 0 auto auto auto;
}
</style>
