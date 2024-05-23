<template>
<span ref="container" :class="$style.root">
	<span ref="el" :class="$style.inner" style="position: absolute">
		<slot></slot>
	</span>
</span>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, shallowRef } from 'vue';
const el = shallowRef<HTMLElement>();
const container = shallowRef<HTMLElement>();
const props = defineProps({
	x: {
		type: Boolean,
		default: true,
	},
	y: {
		type: Boolean,
		default: true,
	},
	speed: {
		type: String,
		default: '0.1s',
	},
	rotateByVelocity: {
		type: Boolean,
		default: true,
	},
});

let lastX = 0;
let lastY = 0;
let oldAngle = 0;

function lerp(a, b, alpha) {
	return a + alpha * (b - a);
}

const updatePosition = (mouseEvent: MouseEvent) => {
	if (el.value && container.value) {
		const containerRect = container.value.getBoundingClientRect();
		const newX = mouseEvent.clientX - containerRect.left;
		const newY = mouseEvent.clientY - containerRect.top;
		let transform = `translate(calc(${props.x ? newX : 0}px - 50%), calc(${props.y ? newY : 0}px - 50%))`;
		if (props.rotateByVelocity) {
			const deltaX = newX - lastX;
			const deltaY = newY - lastY;
			const angle = lerp(
				oldAngle,
				Math.atan2(deltaY, deltaX) * (180 / Math.PI),
				0.1,
			);
			transform += ` rotate(${angle}deg)`;
			oldAngle = angle;
		}
		el.value.style.transform = transform;
		el.value.style.transition = `transform ${props.speed}`;
		lastX = newX;
		lastY = newY;
	}
};

onMounted(() => {
	window.addEventListener('mousemove', updatePosition);
});

onUnmounted(() => {
	window.removeEventListener('mousemove', updatePosition);
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	display: inline-block;
}
.inner {
	transform-origin: center center;
}
</style>
