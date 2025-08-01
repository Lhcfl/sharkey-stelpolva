<!--
SPDX-FileCopyrightText: kopper and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

Displays Oneko, a cat that follows the cursor.
-->

<template>
<div ref="nekoEl" :class="$style.oneko" aria-hidden="true"></div>
</template>

<script lang="ts" setup>
// oneko.js: https://github.com/adryd325/oneko.js
// modified to be a vue component by ShittyKopper :3

import { shallowRef, onMounted, onUnmounted } from 'vue';

const nekoEl = shallowRef<HTMLDivElement>();

let nekoPosX = 32;
let nekoPosY = 32;

let mousePosX = 0;
let mousePosY = 0;

let frameCount = 0;
let idleTime = 0;
let idleAnimation: string | null = null;
let idleAnimationFrame = 0;
let lastFrameTimestamp;

const nekoSpeed = 10;
const spriteSets = {
	idle: [[-3, -3]],
	alert: [[-7, -3]],
	scratchSelf: [
		[-5, 0],
		[-6, 0],
		[-7, 0],
	],
	scratchWallN: [
		[0, 0],
		[0, -1],
	],
	scratchWallS: [
		[-7, -1],
		[-6, -2],
	],
	scratchWallE: [
		[-2, -2],
		[-2, -3],
	],
	scratchWallW: [
		[-4, 0],
		[-4, -1],
	],
	tired: [[-3, -2]],
	sleeping: [
		[-2, 0],
		[-2, -1],
	],
	N: [
		[-1, -2],
		[-1, -3],
	],
	NE: [
		[0, -2],
		[0, -3],
	],
	E: [
		[-3, 0],
		[-3, -1],
	],
	SE: [
		[-5, -1],
		[-5, -2],
	],
	S: [
		[-6, -3],
		[-7, -2],
	],
	SW: [
		[-5, -3],
		[-6, -1],
	],
	W: [
		[-4, -2],
		[-4, -3],
	],
	NW: [
		[-1, 0],
		[-1, -1],
	],
};

function mouseCallback(event) {
	mousePosX = event.clientX;
	mousePosY = event.clientY;
}

function init() {
	if (!nekoEl.value) return;

	nekoEl.value.style.left = `${nekoPosX - 16}px`;
	nekoEl.value.style.top = `${nekoPosY - 16}px`;

	window.document.addEventListener('mousemove', mouseCallback, { passive: true });

	window.requestAnimationFrame(onAnimationFrame);
}

function uninit() {
	window.removeEventListener('mousemove', mouseCallback, { passive: true });
}

function onAnimationFrame(timestamp) {
	// Stops execution if the neko element is removed from DOM
	if (!nekoEl.value?.isConnected) {
		return;
	}
	if (!lastFrameTimestamp) {
		lastFrameTimestamp = timestamp;
	}
	if (timestamp - lastFrameTimestamp > 100) {
		lastFrameTimestamp = timestamp;
		frame();
	}
	window.requestAnimationFrame(onAnimationFrame);
}

// eslint-disable-next-line no-shadow
function setSprite(name, frame) {
	if (!nekoEl.value) return;

	const sprite = spriteSets[name][frame % spriteSets[name].length];
	nekoEl.value.style.backgroundPosition = `${sprite[0] * 32}px ${sprite[1] * 32}px`;
}

function resetIdleAnimation() {
	idleAnimation = null;
	idleAnimationFrame = 0;
}

function idle() {
	idleTime += 1;

	// every ~ 20 seconds
	if (
		idleTime > 10 &&
      Math.floor(Math.random() * 200) === 0 &&
      idleAnimation == null
	) {
		let avalibleIdleAnimations = ['sleeping', 'scratchSelf'];
		if (nekoPosX < 32) {
			avalibleIdleAnimations.push('scratchWallW');
		}
		if (nekoPosY < 32) {
			avalibleIdleAnimations.push('scratchWallN');
		}
		if (nekoPosX > window.innerWidth - 32) {
			avalibleIdleAnimations.push('scratchWallE');
		}
		if (nekoPosY > window.innerHeight - 32) {
			avalibleIdleAnimations.push('scratchWallS');
		}
		idleAnimation =
        avalibleIdleAnimations[Math.floor(Math.random() * avalibleIdleAnimations.length)];
	}

	switch (idleAnimation) {
		case 'sleeping':
			if (idleAnimationFrame < 8) {
				setSprite('tired', 0);
				break;
			}
			setSprite('sleeping', Math.floor(idleAnimationFrame / 4));
			if (idleAnimationFrame > 192) {
				resetIdleAnimation();
			}
			break;
		case 'scratchWallN':
		case 'scratchWallS':
		case 'scratchWallE':
		case 'scratchWallW':
		case 'scratchSelf':
			setSprite(idleAnimation, idleAnimationFrame);
			if (idleAnimationFrame > 9) {
				resetIdleAnimation();
			}
			break;
		default:
			setSprite('idle', 0);
			return;
	}
	idleAnimationFrame += 1;
}

function frame() {
	if (!nekoEl.value) return;

	frameCount += 1;
	const diffX = nekoPosX - mousePosX;
	const diffY = nekoPosY - mousePosY;
	const distance = Math.sqrt(diffX ** 2 + diffY ** 2);

	if (distance < nekoSpeed || distance < 48) {
		idle();
		return;
	}

	idleAnimation = null;
	idleAnimationFrame = 0;

	if (idleTime > 1) {
		setSprite('alert', 0);
		// count down after being alerted before moving
		idleTime = Math.min(idleTime, 7);
		idleTime -= 1;
		return;
	}

	let direction;
	direction = diffY / distance > 0.5 ? 'N' : '';
	direction += diffY / distance < -0.5 ? 'S' : '';
	direction += diffX / distance > 0.5 ? 'W' : '';
	direction += diffX / distance < -0.5 ? 'E' : '';
	setSprite(direction, frameCount);

	nekoPosX -= (diffX / distance) * nekoSpeed;
	nekoPosY -= (diffY / distance) * nekoSpeed;

	nekoPosX = Math.min(Math.max(16, nekoPosX), window.innerWidth - 16);
	nekoPosY = Math.min(Math.max(16, nekoPosY), window.innerHeight - 16);

	nekoEl.value.style.left = `${nekoPosX - 16}px`;
	nekoEl.value.style.top = `${nekoPosY - 16}px`;
}

onMounted(init);
onUnmounted(uninit);
</script>

<style module>
.oneko {
	width: 32px;
	height: 32px;
	position: fixed;
	pointer-events: none;
	image-rendering: pixelated;
	z-index: 2147483647;
	background-image: var(--MI_THEME-oneko-image, url(/client-assets/oneko.gif));
}
</style>
