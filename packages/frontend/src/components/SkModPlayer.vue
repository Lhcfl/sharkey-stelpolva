<!--
SPDX-FileCopyrightText: puniko and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

Media player for module files. Displays the pattern in real time as it plays.
-->

<template>
<div v-if="hide" :class="$style.mod_player_disabled" @click="toggleVisible()">
	<div>
		<b><i class="ph-eye ph-bold ph-lg"></i> {{ i18n.ts.sensitive }}</b>
		<span>{{ i18n.ts.clickToShow }}</span>
	</div>
</div>

<div v-else :class="$style.mod_player_enabled">
	<div ref="patternDisplay" :style="{ height: displayHeight + 'px' }" :class="$style.pattern_display" @click="togglePattern()" @scroll="scrollHandler" @scrollend="scrollEndHandle">
		<div v-if="patternHide" :class="$style.pattern_hide">
			<b><i class="ph-eye ph-bold ph-lg"></i> Pattern Hidden</b>
			<span>{{ i18n.ts.clickToShow }}</span>
		</div>
		<span :class="$style.patternShadowTop"></span>
		<span :class="$style.patternShadowBottom"></span>
		<div ref="sliceDisplay" :class="$style.slice_display">
			<span :class="$style.numberRowParent">
				<span ref="numberRowBackground" :style="{ top: numberRowOffset + 'px' }" :class="$style.numberRowBackground">
					<canvas ref="numberRowCanvas" :class="$style.row_canvas"></canvas>
				</span>
			</span>
			<span>
				<span ref="sliceBackground1" :class="$style.sliceBackground">
					<canvas ref="sliceCanvas1" :class="$style.patternSlice"></canvas>
				</span>
				<span ref="sliceBackground2" :class="$style.sliceBackground">
					<canvas ref="sliceCanvas2" :class="$style.patternSlice"></canvas>
				</span>
				<span ref="sliceBackground3" :class="$style.sliceBackground">
					<canvas ref="sliceCanvas3" :class="$style.patternSlice"></canvas>
				</span>
			</span>
		</div>
	</div>
	<div :class="$style.controls">
		<input v-if="patternScrollSliderShow" ref="patternScrollSlider" v-model="patternScrollSliderPos" :class="$style.pattern_slider" type="range" min="0" max="1" step="0.0001" style=""/>
		<button :class="$style.play" @click="playPause()">
			<i v-if="playing" class="ph-pause ph-bold ph-lg"></i>
			<i v-else class="ph-play ph-bold ph-lg"></i>
		</button>
		<button :class="$style.stop" @click="stop()">
			<i class="ph-stop ph-bold ph-lg"></i>
		</button>
		<input ref="progress" v-model="position" :class="$style.progress" type="range" min="0" max="1" step="0.1" @mousedown="initSeek()" @mouseup="performSeek()"/>
		<input v-model="player.context.gain.value" type="range" min="0" max="1" step="0.01"/>
		<a :class="$style.download" :title="i18n.ts.download" :href="module.url" :download="module.name" target="_blank">
			<i class="ph-download ph-bold ph-lg"></i>
		</a>
	</div>
	<i :class="$style.hide" class="ph-eye-slash ph-bold ph-lg" @click="toggleVisible()"></i>
</div>
</template>

<script lang="ts" setup>
import { ref, nextTick, watch, onDeactivated, onMounted } from 'vue';
import * as Misskey from 'misskey-js';
import type { Ref } from 'vue';
import { i18n } from '@/i18n.js';
import { ChiptuneJsPlayer, ChiptuneJsConfig } from '@/utility/chiptune2.js';
import { isTouchUsing } from '@/utility/touch.js';
import { prefer } from '@/preferences.js';

const colours = {
	background: '#000000',
	foreground: '#ffffff',
};

const CHAR_WIDTH = 6;
const CHAR_HEIGHT = 12;
const ROW_OFFSET_Y = 10;
const CHANNEL_WIDTH = CHAR_WIDTH * 14;
const MAX_ROW_NUMBERS = 0x100;
// It would be a great option for users to set themselves.
const ROW_BUFFER = 26;
const MAX_CHANNEL_LIMIT = 0xFF;
const HALF_BUFFER = Math.floor(ROW_BUFFER / 2);
const MAX_SLICE_CHANNELS = 10;
const MAX_SLICE_WIDTH = CHANNEL_WIDTH * MAX_SLICE_CHANNELS + 1;
const NUMBER_ROW_WIDTH = 2 * CHAR_WIDTH + 1;

const props = defineProps<{
	module: Misskey.entities.DriveFile
}>();

class CanvasDisplay {
	ctx: CanvasRenderingContext2D;
	html: HTMLCanvasElement;
	background: HTMLSpanElement;
	drawn: { top: number, bottom: number };
	vPos: number;
	transform: { x: number, y: number };
	drawStart: number;
	constructor (
		ctx: CanvasRenderingContext2D,
		html: HTMLCanvasElement,
		background: HTMLSpanElement,
	) {
		this.ctx = ctx;
		this.html = html;
		this.drawn = {
			top: Infinity,
			bottom: -Infinity,
		};
		this.vPos = -Infinity;
		this.transform = {
			x: 0,
			y: 0,
		};
		this.drawStart = 0;
		this.background = background;
		// Hacky solution to seeing raw background while the module isn't loaded yet.
		background.style.display = 'flex';
	}
	updateStyleTransforms () {
		this.background.style.transform = 'translate(' + this.transform.x + 'px,' + this.transform.y + 'px)';
	}
	resetDrawn() {
		this.drawn = {
			top: Infinity,
			bottom: -Infinity,
		};
	}
}

const isSensitive = props.module.isSensitive;
const url = props.module.url;
let hide = ref((prefer.s.nsfw === 'force') ? true : isSensitive && (prefer.s.nsfw !== 'ignore'));
const patternHide = ref<boolean>(true);
const playing = ref<boolean>(false);
const sliceDisplay = ref<HTMLDivElement>();
const numberRowCanvas = ref<HTMLCanvasElement>();
const numberRowBackground = ref<HTMLSpanElement>();
const sliceCanvas1 = ref<HTMLCanvasElement>();
const sliceCanvas2 = ref<HTMLCanvasElement>();
const sliceCanvas3 = ref<HTMLCanvasElement>();
const sliceBackground1 = ref<HTMLSpanElement>();
const sliceBackground2 = ref<HTMLSpanElement>();
const sliceBackground3 = ref<HTMLSpanElement>();
const displayHeight = ref<number>(ROW_BUFFER * CHAR_HEIGHT);
const numberRowOffset = ref<number>(HALF_BUFFER * CHAR_HEIGHT);
const progress = ref<HTMLProgressElement>();
const position = ref<number>(0);
const patternScrollSlider = ref<HTMLProgressElement>();
const patternScrollSliderShow = ref<boolean>(false);
const patternScrollSliderPos = ref<number>(0);
const patternDisplay = ref<HTMLDivElement>();
let sliceWidth = 0;
let sliceHeight = 0;
const player = ref(new ChiptuneJsPlayer(new ChiptuneJsConfig()));

let nbChannels = 0;
let currentColumn = 0;
let currentRealColumn = 0;
let channelsInView = 10;
let buffer = null;
let isSeeking = false;
let firstFrame = true;
let lastPattern = -1;
let lastDrawnRow = -1;
let virtualCanvasWidth = 0;
let slices: CanvasDisplay[] = [];
let numberRowPHTML: HTMLSpanElement;

function bakeNumberRow() {
	if (numberRowCanvas.value && numberRowBackground.value) {
		numberRowCanvas.value.width = NUMBER_ROW_WIDTH;
		numberRowCanvas.value.height = MAX_ROW_NUMBERS * CHAR_HEIGHT + 1;
		numberRowPHTML = numberRowBackground.value;
		numberRowPHTML.style.display = 'block';
		let ctx = numberRowCanvas.value.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
		ctx.font = '10px "Liberation Mono", "Courier New", "Droid Sans Mono", "Roboto Mono", "Luxi Mono", "FreeMono", monospace';
		ctx.fillStyle = colours.background;
		ctx.fillRect( 0, 0, numberRowCanvas.value.width, numberRowCanvas.value.height );

		ctx.fillStyle = colours.foreground;
		for (let i = 0; i <= MAX_ROW_NUMBERS; i++) {
			let rowText = i.toString(16);
			if (rowText.length === 1) rowText = '0' + rowText;
			ctx.fillText(rowText, 0, ROW_OFFSET_Y + i * 12);
		}
	}
}

function setupSlice(canvas: Ref, back: Ref) {
	let backgorund = back.value as HTMLSpanElement;
	let chtml = canvas.value as HTMLCanvasElement;
	chtml.width = sliceWidth;
	chtml.height = sliceHeight;
	let slice = new CanvasDisplay(
		chtml.getContext('2d', { alpha: false, desynchronized: false }) as CanvasRenderingContext2D,
		chtml,
		backgorund,
	);
	slice.ctx.font = '10px "Liberation Mono", "Courier New", "Droid Sans Mono", "Roboto Mono", "Luxi Mono", "FreeMono", monospace';
	slice.ctx.imageSmoothingEnabled = false;
	slices.push(slice);
}

function setupCanvas(r = 0) {
	if (
		sliceCanvas1.value && sliceCanvas2.value && sliceCanvas3.value &&
		sliceBackground1.value && sliceCanvas2.value && sliceCanvas3.value
	) {
		nbChannels = 0;
		if (player.value.currentPlayingNode) {
			nbChannels = player.value.currentPlayingNode.nbChannels;
			nbChannels = nbChannels > MAX_CHANNEL_LIMIT ? MAX_CHANNEL_LIMIT : nbChannels;
		}
		virtualCanvasWidth = NUMBER_ROW_WIDTH + CHANNEL_WIDTH * nbChannels + 2;
		sliceWidth = MAX_SLICE_WIDTH > virtualCanvasWidth ? virtualCanvasWidth : MAX_SLICE_WIDTH;
		sliceHeight = HALF_BUFFER * CHAR_HEIGHT;
		slices = [];
		setupSlice(sliceCanvas1, sliceBackground1);
		setupSlice(sliceCanvas2, sliceBackground2);
		setupSlice(sliceCanvas3, sliceBackground3);
		if (sliceDisplay.value) sliceDisplay.value.style.minWidth = (virtualCanvasWidth) + 'px';
	} else {
		if (r > 9) {
			console.warn('SkModPlayer: Jumped to the next tick multiple times without any results, is Vue ok?');
			return;
		}
		nextTick(() => {
			setupCanvas(r + 1);
		});
	}
}

onMounted(() => {
	player.value.load(url).then((result) => {
		buffer = result;
		try {
			player.value.play(buffer);
			progress.value!.max = player.value.duration();
			bakeNumberRow();
			setupCanvas();
			display(true);
		} catch (err) {
			console.warn(err);
		}
		player.value.stop();
	}).catch((error) => {
		console.error(error);
	});
	if (patternDisplay.value) {
		let observer = new ResizeObserver(resizeHandler);
		observer.observe(patternDisplay.value);
	}
});

function playPause() {
	player.value.addHandler('onRowChange', () => {
		progress.value!.max = player.value.duration();
		if (!isSeeking) {
			position.value = player.value.position() % player.value.duration();
		}
		display();
	});

	player.value.addHandler('onEnded', () => {
		stop();
	});

	if (player.value.currentPlayingNode === null) {
		player.value.play(buffer);
		player.value.seek(position.value);
		playing.value = true;
	} else {
		player.value.togglePause();
		playing.value = !player.value.currentPlayingNode.paused;
	}
}

function stop(noDisplayUpdate = false) {
	player.value.stop();
	playing.value = false;
	if (!noDisplayUpdate) {
		try {
			player.value.play(buffer);
			lastDrawnRow = -1;
			lastPattern = -1;
			display(true);
		} catch (err) {
			console.warn(err);
		}
	}
	player.value.stop();
	position.value = 0;
	player.value.handlers = [];
}

function initSeek() {
	isSeeking = true;
}

function performSeek(forceUpate = false) {
	const noNode = !player.value.currentPlayingNode;
	if (noNode) player.value.play(buffer);
	player.value.seek(position.value);
	if (!patternHide.value || forceUpate) display(true);
	if (noNode) player.value.stop();
	isSeeking = false;
}

function toggleVisible() {
	hide.value = !hide.value;
	if (!hide.value) {
		lastPattern = -1;
		lastDrawnRow = -1;
		nextTick(() => {
			playPause();
			bakeNumberRow();
			setupCanvas();
		});
	}
	nextTick(() => { stop(hide.value); });
}

function togglePattern() {
	patternHide.value = !patternHide.value;
	handleScrollBarEnable();
	performSeek(true);
}

function drawSlices(skipOptimizationChecks = false) {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (ROW_BUFFER <= 0) {
		lastDrawnRow = player.value.getPattern();
		lastPattern = player.value.getRow();
		return;
	}

	const pattern = player.value.getPattern();
	const row = player.value.getRow();
	const lower = row + HALF_BUFFER;
	//const upper = row - HALF_BUFFER;
	const newDisplayTanslation = -row * CHAR_HEIGHT;
	let curRow = row - HALF_BUFFER;

	if (pattern === lastPattern && !skipOptimizationChecks && row !== lastDrawnRow) {
		const rowDif = row - lastDrawnRow;
		const isRowDirPos = rowDif > 0;
		const rowDir = !isRowDirPos as unknown as number;
		const rowDirInv = 1 - 1 * rowDir;
		const norm = 1 - 2 * rowDir;
		const oneAndHalfBuf = HALF_BUFFER * 3;

		slices.forEach((sli) => {
			sli.vPos -= rowDif;
			if (sli.vPos <= 0 || sli.vPos >= oneAndHalfBuf) {
				sli.drawStart += oneAndHalfBuf * norm;
				sli.vPos = oneAndHalfBuf * rowDirInv;
				sli.transform.y += (oneAndHalfBuf * CHAR_HEIGHT) * norm;
				sli.updateStyleTransforms();
				sli.resetDrawn();

				sli.ctx.fillStyle = colours.background;
				sli.ctx.fillRect(0, 0, sliceWidth, sliceHeight);
			}
			let patternText: string[] = [];
			for (let i = 0; i < HALF_BUFFER; i++) {
				const newRow = sli.drawStart + i;

				if (sli.drawn.bottom >= newRow && sli.drawn.top <= newRow /*|| newRow < upper || newRow > lower*/) {
					patternText.push('');
					continue;
				}
				if (sli.drawn.top > newRow) sli.drawn.top = newRow;
				if (sli.drawn.bottom <= newRow) sli.drawn.bottom = newRow;

				patternText.push(getRowText(sli, newRow, pattern));
			}
			drawText(sli, patternText, (currentRealColumn - currentColumn) * CHANNEL_WIDTH);
		});
	} else {
		numberRowPHTML.style.height = ((player.value.getPatternNumRows(pattern) + HALF_BUFFER) * CHAR_HEIGHT) + 'px';
		slices.forEach((sli, i) => {
			sli.drawStart = curRow;
			sli.vPos = HALF_BUFFER * (i + 1);
			sli.transform.y = -newDisplayTanslation;
			sli.updateStyleTransforms();
			sli.resetDrawn();

			sli.ctx.fillStyle = colours.background;
			sli.ctx.fillRect(0, 0, sliceWidth, sliceHeight);

			let patternText: string[] = [];

			for (let itter = 0; itter < HALF_BUFFER; itter++) {
				if (sli.drawn.top > curRow) sli.drawn.top = curRow;
				if (sli.drawn.bottom <= curRow) sli.drawn.bottom = curRow;
				patternText.push(getRowText(sli, curRow, pattern));
				curRow++;
				if (curRow > lower) break;
			}
			drawText(sli, patternText, (currentRealColumn - currentColumn) * CHANNEL_WIDTH);
		});
	}

	if (sliceDisplay.value) sliceDisplay.value.style.transform = 'translateY(' + (newDisplayTanslation - HALF_BUFFER * CHAR_HEIGHT) + 'px)';

	lastDrawnRow = row;
	lastPattern = pattern;
}

function getRowText(slice: CanvasDisplay, row: number, pattern: number) : string {
	if (!player.value.currentPlayingNode) return '';
	if (row < 0 || row > player.value.getPatternNumRows(pattern) - 1) return '';
	let retrunStr = '|';

	for (let channel = currentRealColumn; channel < nbChannels; channel++) {
		if (channel === channelsInView + currentRealColumn) break;
		const part = player.value.getPatternRowChannel(pattern, row, channel);
		retrunStr += part + '|';
	}
	return retrunStr;
}

function drawText(slice: CanvasDisplay, text: string[], drawX = 0, drawY = ROW_OFFSET_Y) {
	slice.ctx.fillStyle = colours.foreground;
	text.forEach((str, i) => {
		if (str.length !== 0) slice.ctx.fillText(str, drawX, drawY + CHAR_HEIGHT * i);
	});

	return true;
}

function display(skipOptimizationChecks = false) {
	if (!sliceDisplay.value || !sliceDisplay.value.parentElement) {
		stop();
		return;
	}

	if (patternHide.value && !skipOptimizationChecks) return;

	if (firstFrame) {
		handleScrollBarEnable();
		firstFrame = false;
	}

	const row = player.value.getRow();
	const pattern = player.value.getPattern();

	if ( row === lastDrawnRow && pattern === lastPattern && !skipOptimizationChecks) return;

	drawSlices(skipOptimizationChecks);
}

function forceUpdateDisplay() {
	const noNode = !player.value.currentPlayingNode;
	if (noNode) player.value.play(buffer);
	if (!patternHide.value) display(true);
	if (noNode) player.value.togglePause();
	slices.forEach((sli) => {
		sli.transform.x = currentColumn * CHANNEL_WIDTH;
		sli.updateStyleTransforms();
	});
}

let suppressSliderWatcher = false;
let webkitTimeoutID = -1;

function scrollHandler() {
	if (!sliceDisplay.value || !sliceDisplay.value.parentElement) return;

	if (patternScrollSlider.value) {
		suppressSliderWatcher = true;
		webkitSliderHackSetup();
		patternScrollSliderPos.value = sliceDisplay.value.parentElement.scrollLeft / ((virtualCanvasWidth - channelsInView + NUMBER_ROW_WIDTH) - sliceDisplay.value.parentElement.offsetWidth);
		patternScrollSlider.value.style.opacity = '1';
	}
	const newColumn = Math.trunc(sliceDisplay.value.parentElement.scrollLeft / CHANNEL_WIDTH);
	const correctedNewColumn = newColumn > nbChannels - MAX_SLICE_CHANNELS ? nbChannels - MAX_SLICE_CHANNELS : newColumn;
	if (correctedNewColumn !== currentColumn || newColumn !== currentRealColumn) {
		currentRealColumn = newColumn;
		currentColumn = correctedNewColumn;
		forceUpdateDisplay();
	}
}

// https://bugs.webkit.org/show_bug.cgi?id=201556
function webkitSliderHack () {
	suppressSliderWatcher = false;
	webkitTimeoutID = -1;
	if (!patternScrollSlider.value) return;
	patternScrollSlider.value.style.opacity = '';
}

let webkitSliderHackSetup = function() {
	if (webkitTimeoutID > 0) {
		window.clearTimeout(webkitTimeoutID);
		webkitTimeoutID = -1;
	}
	if (webkitTimeoutID < 0) webkitTimeoutID = window.setTimeout(webkitSliderHack);
};

let webkitDisableHack = function() {
	if (webkitTimeoutID > 0) window.clearTimeout(webkitTimeoutID);
	webkitTimeoutID = -2;
	// I hope SpiderMonkey/V8 is smart enough not to call empty functions.
	webkitDisableHack = function() {};
	webkitSliderHackSetup = function() {};
};

function scrollEndHandle() {
	suppressSliderWatcher = false;
	webkitDisableHack();
	if (!patternScrollSlider.value) return;
	patternScrollSlider.value.style.opacity = '';
}

function handleScrollBarEnable() {
	patternScrollSliderShow.value = (!patternHide.value && !isTouchUsing);
	patternScrollSliderShow.value = (!patternHide.value);
	if (patternScrollSliderShow.value !== true) return;

	if (sliceDisplay.value && sliceDisplay.value.parentElement) patternScrollSliderShow.value = (virtualCanvasWidth > sliceDisplay.value.parentElement.offsetWidth);
}

watch(patternScrollSliderPos, () => {
	if (!sliceDisplay.value || !sliceDisplay.value.parentElement || suppressSliderWatcher) return;
	sliceDisplay.value.parentElement.scrollLeft = ((virtualCanvasWidth - channelsInView + NUMBER_ROW_WIDTH) - sliceDisplay.value.parentElement.offsetWidth) * patternScrollSliderPos.value;
});

function resizeHandler(event: ResizeObserverEntry[]) {
	if (event[0].contentRect.width === 0) return;
	const newView = Math.ceil(event[0].contentRect.width / CHANNEL_WIDTH) + 1;
	if (newView > channelsInView) forceUpdateDisplay();
	channelsInView = newView;
	handleScrollBarEnable();
}

onDeactivated(() => {
	stop();
});

</script>

<style lang="scss" module>

:root {
	--MI_THEME-modPlayerDefault: #ffffff;
	--MI_THEME-modPlayerQuarter: #ffff00;
	--MI_THEME-modPlayerInstr: #80e0ff;
	--MI_THEME-modPlayerVolume: #80ff80;
	--MI_THEME-modPlayerFx: #ff80e0;
	--MI_THEME-modPlayerOperant: #ffe080;
	--MI_THEME-modPlayerShadow: #00000080;
	--MI_THEME-modPlayerSliderKnob: hsl(from var(--MI_THEME-indicator) h s calc(l * 0.1));
}

.hide {
	border-radius: var(--MI-radius-sm) !important;
	background-color: black !important;
	color: var(--MI_THEME-indicator) !important;
	font-size: 12px !important;
}

.mod_player_enabled {
	position: relative;
	overflow: hidden;
	display: flex;
	flex-direction: column;
	justify-content: center;

	> i {
		display: block;
		position: absolute;
		border-radius: var(--MI-radius-sm);
		background-color: var(--MI_THEME-fg);
		color: var(--MI_THEME-indicator);
		font-size: 14px;
		opacity: .5;
		padding: 3px 6px;
		text-align: center;
		cursor: pointer;
		top: 12px;
		right: 12px;
		z-index: 4;
	}

	> .pattern_display {
		width: 100%;
		overflow-x: scroll;
		overflow-y: clip;
		background-color: black;
		text-align: center;
		max-height: 312px; /* magic_number = CHAR_HEIGHT * rowBuffer, needs to be in px */
		scrollbar-width: none;

		canvas {
			image-rendering: pixelated;
			mix-blend-mode: multiply;
			background-color: #000000;
		}

		.slice_display {
			display: flex;
			position: relative;
			background-color: black;
			image-rendering: pixelated;
			top: 50%;
			span {
				.sliceBackground {
					display: none;
					width: fit-content;
					height: fit-content;
					position: relative;
					background: repeating-linear-gradient(
						to right,
						var(--MI_THEME-modPlayerDefault) 0px calc(5 * 6px),
						var(--MI_THEME-modPlayerInstr) calc(5 * 6px) calc(7 * 6px),
						var(--MI_THEME-modPlayerVolume) calc(7 * 6px) calc(10 * 6px),
						var(--MI_THEME-modPlayerFx) calc(10 * 6px) calc(13 * 6px),
						var(--MI_THEME-modPlayerOperant) calc(13 * 6px) calc(14 * 6px),
					);
					.patternSlice {
						position: static;
					}
				}
			}
			.numberRowParent {
				position: sticky;
				z-index: 1;
				inset: 0;
				width: fit-content;
				height: 200%;
				overflow: clip;
				background: #000000;
				.numberRowBackground {
					position: relative;
					display: none;
					background-image: repeating-linear-gradient(
						to bottom,
						var(--MI_THEME-modPlayerDefault) 0px calc(3 * 12px),
						var(--MI_THEME-modPlayerQuarter) calc(3 * 12px) calc(4 * 12px),
					);
					.row_canvas {
						position: static;
						right: 0;
						z-index: 1;
						inset: 0;
					}
				}
			}
		}

		.patternShadowTop {
			background: var(--MI_THEME-modPlayerShadow);
			width: 100%;
			height: calc(50% - 12px);
			translate: -50% -100%;
			top: calc(50% - 13px);
			position: absolute;
			pointer-events: none;
			z-index: 2;
		}

		.patternShadowBottom {
			background: var(--MI_THEME-modPlayerShadow);
			width: 100%;
			height: calc(50% - 27px);
			translate: -50% 0%;
			top: calc(50% - 2px);
			position: absolute;
			pointer-events: none;
			z-index: 2;
		}

		.pattern_hide {
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			background: rgba(64, 64, 64, 0.3);
			backdrop-filter: var(--MI-modalBgFilter);
			color: #fff;
			font-size: 12px;

			position: absolute;
			z-index: 4;
			width: 100%;
			height: 100%;

			> span {
				display: block;
			}
		}
	}

	> .controls {
		display: flex;
		width: 100%;
		background-color: var(--MI_THEME-bg);
		z-index: 5;

		> * {
			padding: 4px 8px;
		}

		> button, a {
			border: none;
			background-color: transparent;
			color: var(--MI_THEME-accent);
			cursor: pointer;

			&:hover {
				background-color: var(--MI_THEME-fg);
			}
		}

		> input[type=range] {
			height: 21px;
			-webkit-appearance: none;
			width: 90px;
			padding: 0;
			margin: 4px 8px;
			overflow-x: hidden;

			&.pattern_slider {
				position: absolute;
				width: calc( 100% - 8px * 2 );
				top: calc( 100% - 21px * 3 );
				opacity: 0%;
				transition: opacity 0.2s;

				&:hover {
					opacity: 100%;
				}
			}

			&:focus {
				outline: none;

				&::-webkit-slider-runnable-track {
					background: var(--MI_THEME-bg);
				}

				&::-ms-fill-lower, &::-ms-fill-upper {
					background: var(--MI_THEME-bg);
				}
			}

			&::-webkit-slider-runnable-track {
				width: 100%;
				height: 100%;
				cursor: pointer;
				border-radius: 0;
				animate: 0.2s;
				background: var(--MI_THEME-bg);
				border: 1px solid var(--MI_THEME-fg);
				overflow-x: hidden;
			}

			&::-webkit-slider-thumb {
				border: none;
				height: 100%;
				width: 14px;
				border-radius: 0;
				background: var(--MI_THEME-modPlayerSliderKnob);
				cursor: pointer;
				-webkit-appearance: none;
				box-shadow: calc(-100vw - 14px) 0 0 100vw var(--MI_THEME-accent);
				clip-path: polygon(1px 0, 100% 0, 100% 100%, 1px 100%, 1px calc(50% + 11px), -100vw calc(50% + 11px), -100vw calc(50% - 10px), 0 calc(50% - 10px));
				z-index: 1;
			}

			&::-moz-range-track {
				width: 100%;
				height: 100%;
				cursor: pointer;
				border-radius: 0;
				animate: 0.2s;
				background: var(--MI_THEME-bg);
				border: 1px solid var(--MI_THEME-fg);
			}

			&::-moz-range-progress {
				cursor: pointer;
				height: 100%;
				background: var(--MI_THEME-accent);
			}

			&::-moz-range-thumb {
				border: none;
				height: 100%;
				border-radius: 0;
				width: 14px;
				background: var(--MI_THEME-modPlayerSliderKnob);
				cursor: pointer;
			}

			&::-ms-track {
				width: 100%;
				height: 100%;
				cursor: pointer;
				border-radius: 0;
				animate: 0.2s;
				background: transparent;
				border-color: transparent;
				color: transparent;
			}

			&::-ms-fill-lower {
				background: var(--MI_THEME-accent);
				border: 1px solid var(--MI_THEME-fg);
				border-radius: 0;
			}

			&::-ms-fill-upper {
				background: var(--MI_THEME-bg);
				border: 1px solid var(--MI_THEME-fg);
				border-radius: 0;
			}

			&::-ms-thumb {
				margin-top: 1px;
				border: none;
				height: 100%;
				width: 14px;
				border-radius: 0;
				background: var(--MI_THEME-modPlayerSliderKnob);
				cursor: pointer;
			}

			&.progress {
				flex-grow: 1;
				min-width: 0;
			}
		}
	}
}

.mod_player_disabled {
	display: flex;
	justify-content: center;
	align-items: center;
	background: #111;
	color: #fff;

	> div {
		display: table-cell;
		text-align: center;
		font-size: 12px;

		> b {
			display: block;
		}
	}
}
</style>
