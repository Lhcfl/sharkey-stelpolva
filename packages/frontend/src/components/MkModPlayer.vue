<template>
<div v-if="hide" class="mod-player-disabled" @click="toggleVisible()">
	<div>
		<b><i class="ph-eye ph-bold ph-lg"></i> {{ i18n.ts.sensitive }}</b>
		<span>{{ i18n.ts.clickToShow }}</span>
	</div>
</div>

<div v-else class="mod-player-enabled">
	<div class="pattern-display" @click="togglePattern()" @scroll="scrollHandler" @scrollend="scrollEndHandle">
		<div v-if="patternHide" class="pattern-hide">
			<b><i class="ph-eye ph-bold ph-lg"></i> Pattern Hidden</b>
			<span>{{ i18n.ts.clickToShow }}</span>
		</div>
		<span class="patternShadowTop"></span>
		<span class="patternShadowBottom"></span>
		<canvas ref="displayCanvas" class="pattern-canvas"></canvas>
	</div>
	<div class="controls">
		<input v-if="patternScrollSliderShow" ref="patternScrollSlider" v-model="patternScrollSliderPos" class="pattern-slider" type="range" min="0" max="100" step="0.01" style=""/>
		<button class="play" @click="playPause()">
			<i v-if="playing" class="ph-pause ph-bold ph-lg"></i>
			<i v-else class="ph-play ph-bold ph-lg"></i>
		</button>
		<button class="stop" @click="stop()">
			<i class="ph-stop ph-bold ph-lg"></i>
		</button>
		<input ref="progress" v-model="position" class="progress" type="range" min="0" max="1" step="0.1" @mousedown="initSeek()" @mouseup="performSeek()"/>
		<input v-model="player.context.gain.value" type="range" min="0" max="1" step="0.1"/>
		<a class="download" :title="i18n.ts.download" :href="module.url" target="_blank">
			<i class="ph-download ph-bold ph-lg"></i>
		</a>
	</div>
	<i class="hide ph-eye-slash ph-bold ph-lg" @click="toggleVisible()"></i>
</div>
</template>

<script lang="ts" setup>
import { ref, nextTick, computed, watch, onDeactivated } from 'vue';
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { defaultStore } from '@/store.js';
import { ChiptuneJsPlayer, ChiptuneJsConfig } from '@/scripts/chiptune2.js';
import { isTouchUsing } from '@/scripts/touch.js';

const colours = {
	background: '#000000',
	foreground: {
		default: '#ffffff',
		quarter: '#ffff00',
		instr: '#80e0ff',
		volume: '#80ff80',
		fx: '#ff80e0',
		operant: '#ffe080',
	},
};

const CHAR_WIDTH = 6;
const CHAR_HEIGHT = 12;
const ROW_OFFSET_Y = 10;

const props = defineProps<{
	module: Misskey.entities.DriveFile
}>();

const isSensitive = computed(() => { return props.module.isSensitive; });
const url = computed(() => { return props.module.url; });
let hide = ref((defaultStore.state.nsfw === 'force') ? true : isSensitive.value && (defaultStore.state.nsfw !== 'ignore'));
let patternHide = ref(false);
let playing = ref(false);
let displayCanvas = ref<HTMLCanvasElement>();
let progress = ref<HTMLProgressElement>();
let position = ref(0);
let patternScrollSlider = ref<HTMLProgressElement>();
let patternScrollSliderShow = ref(false);
let patternScrollSliderPos = ref(0);
const player = ref(new ChiptuneJsPlayer(new ChiptuneJsConfig()));

const maxRowNumbers = 0xFF;
const rowBuffer = 26;
let buffer = null;
let isSeeking = false;
let firstFrame = true;
let lastPattern = -1;
let lastDrawnRow = -1;
let numberRowCanvas = new OffscreenCanvas(2 * CHAR_WIDTH + 1, maxRowNumbers * CHAR_HEIGHT + 1);
let alreadyDrawn = [false];

function bakeNumberRow() {
	let ctx = numberRowCanvas.getContext('2d', { alpha: false }) as OffscreenCanvasRenderingContext2D;
	ctx.font = '10px monospace';

	for (let i = 0; i < maxRowNumbers; i++) {
		let rowText = parseInt(i).toString(16);
		if (rowText.length === 1) rowText = '0' + rowText;

		ctx.fillStyle = colours.foreground.default;
		if (i % 4 === 0) ctx.fillStyle = colours.foreground.quarter;

		ctx.fillText(rowText, 0, 10 + i * 12);
	}
}

bakeNumberRow();

player.value.load(url.value).then((result) => {
	buffer = result;
	try {
		player.value.play(buffer);
		progress.value!.max = player.value.duration();
		display();
	} catch (err) {
		console.warn(err);
	}
	player.value.stop();
}).catch((error) => {
	console.error(error);
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
			display();
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

function performSeek() {
	const noNode = !player.value.currentPlayingNode;
	if (noNode) {
		player.value.play(buffer);
	}
	player.value.seek(position.value);
	display();
	if (noNode) {
		player.value.stop();
	}
	isSeeking = false;
}

function toggleVisible() {
	hide.value = !hide.value;
	if (!hide.value) {
		lastPattern = -1;
		lastDrawnRow = -1;
	}
	nextTick(() => { stop(hide.value); });
}

function togglePattern() {
	patternHide.value = !patternHide.value;
	handleScrollBarEnable();

	if (player.value.getRow() === 0) {
		try {
			player.value.play(buffer);
			display(true);
		} catch (err) {
			console.warn(err);
		}
		player.value.stop();
	} else {
		display(true);
	}
}

function drawPattern() {
	if (!displayCanvas.value) return;
	const canvas = displayCanvas.value;

	const pattern = player.value.getPattern();
	const nbRows = player.value.getPatternNumRows(pattern);
	const row = player.value.getRow();
	const halfbuf = rowBuffer / 2;
	const minRow = row - halfbuf;
	const maxRow = row + halfbuf;

	let rowDif = 0;

	let nbChannels = 0;
	if (player.value.currentPlayingNode) {
		nbChannels = player.value.currentPlayingNode.nbChannels;
	}
	if (pattern === lastPattern) {
		rowDif = row - lastDrawnRow;
	} else {
		alreadyDrawn = [];
		if (canvas.width !== (12 + 84 * nbChannels + 2)) canvas.width = 12 + 84 * nbChannels + 2;
		if (canvas.height !== (12 * nbRows)) canvas.height = 12 * nbRows;
	}

	const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
	ctx.font = '10px monospace';
	ctx.imageSmoothingEnabled = false;
	if (pattern !== lastPattern) {
		ctx.fillStyle = colours.background;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage( numberRowCanvas, 0, 0 );
	}

	ctx.fillStyle = colours.foreground.default;
	for (let rowOffset = minRow + rowDif; rowOffset < maxRow + rowDif; rowOffset++) {
		const rowToDraw = rowOffset - rowDif;

		if (alreadyDrawn[rowToDraw] === true) continue;

		if (rowToDraw >= 0 && rowToDraw < nbRows) {
			const baseOffset = 2 * CHAR_WIDTH;
			const baseRowOffset = ROW_OFFSET_Y + rowToDraw * CHAR_HEIGHT;
			drawRow(ctx, rowToDraw, nbChannels, pattern, baseOffset, baseRowOffset);

			alreadyDrawn[rowToDraw] = true;
		}
	}

	lastDrawnRow = row;
	lastPattern = pattern;
}

function drawPetternPreview() {
	if (!displayCanvas.value) return;
	const canvas = displayCanvas.value;

	const pattern = player.value.getPattern();
	const nbRows = player.value.getPatternNumRows(pattern);
	const row = player.value.getRow();
	const halfbuf = rowBuffer / 2;

	let nbChannels = 0;
	if (player.value.currentPlayingNode) {
		nbChannels = player.value.currentPlayingNode.nbChannels;
	}
	if (canvas.width !== (12 + 84 * nbChannels + 2)) canvas.width = 12 + 84 * nbChannels + 2;
	if (canvas.height !== (12 * rowBuffer)) canvas.height = 12 * rowBuffer;

	const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
	ctx.font = '10px monospace';
	ctx.imageSmoothingEnabled = false;
	ctx.fillStyle = colours.background;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage( numberRowCanvas, 0, (halfbuf - row) * CHAR_HEIGHT );

	ctx.fillStyle = colours.foreground.default;
	for (let rowOffset = 0; rowOffset < rowBuffer; rowOffset++) {
		const rowToDraw = rowOffset + row - halfbuf;

		if (rowToDraw >= 0 && rowToDraw < nbRows) {
			const baseOffset = 2 * CHAR_WIDTH;
			const baseRowOffset = ROW_OFFSET_Y + rowOffset * CHAR_HEIGHT;
			drawRow(ctx, rowToDraw, nbChannels, pattern, baseOffset, baseRowOffset);
		} else if (rowToDraw >= 0) {
			const baseRowOffset = ROW_OFFSET_Y + rowOffset * CHAR_HEIGHT;
			ctx.fillStyle = colours.background;
			ctx.fillRect(0, baseRowOffset - CHAR_HEIGHT, CHAR_WIDTH * 2, baseRowOffset);
		}
	}

	lastPattern = -1;
	lastDrawnRow = -1;
}

function drawRow(ctx: CanvasRenderingContext2D, row: number, channels: number, pattern: number, drawX = (2 * CHAR_WIDTH), drawY = ROW_OFFSET_Y) {
	const spacer = 11;
	const space = ' ';
	let seperators = '';
	let note = '';
	let instr = '';
	let volume = '';
	let fx = '';
	let op = '';
	for (let channel = 0; channel < channels; channel++) {
		const part = player.value.getPatternRowChannel(pattern, row, channel);

		seperators += '|' + space.repeat( spacer + 2 );
		note += part.substring(0, 3) + space.repeat( spacer );
		instr += part.substring(4, 6) + space.repeat( spacer + 1 );
		volume += part.substring(6, 9) + space.repeat( spacer );
		fx += part.substring(10, 11) + space.repeat( spacer + 2 );
		op += part.substring(11, 13) + space.repeat( spacer + 1 );
	}

	ctx.fillStyle = colours.foreground.default;
	ctx.fillText(seperators, drawX, drawY);

	ctx.fillStyle = colours.foreground.default;
	ctx.fillText(note, drawX + CHAR_WIDTH, drawY);

	ctx.fillStyle = colours.foreground.instr;
	ctx.fillText(instr, drawX + CHAR_WIDTH * 5, drawY);

	ctx.fillStyle = colours.foreground.volume;
	ctx.fillText(volume, drawX + CHAR_WIDTH * 7, drawY);

	ctx.fillStyle = colours.foreground.fx;
	ctx.fillText(fx, drawX + CHAR_WIDTH * 11, drawY);

	ctx.fillStyle = colours.foreground.operant;
	ctx.fillText(op, drawX + CHAR_WIDTH * 12, drawY);
}

function display(skipOptimizationChecks = false) {
	if (!displayCanvas.value || !displayCanvas.value.parentElement) {
		stop();
		return;
	}

	if (patternHide.value && !skipOptimizationChecks) return;

	if (firstFrame) {
		// Changing it to false should enable pattern display by default.
		patternHide.value = true;
		handleScrollBarEnable();
		firstFrame = false;
	}

	const row = player.value.getRow();
	const pattern = player.value.getPattern();

	if ( row === lastDrawnRow && pattern === lastPattern && !skipOptimizationChecks) return;

	// Size vs speed
	if (patternHide.value) drawPetternPreview();
	else drawPattern();

	displayCanvas.value.style.top = !patternHide.value ? 'calc( 50% - ' + (row * CHAR_HEIGHT) + 'px )' : '0%';
}

let suppressScrollSliderWatcher = false;

function scrollHandler() {
	suppressScrollSliderWatcher = true;

	if (!patternScrollSlider.value) return;
	if (!displayCanvas.value) return;
	if (!displayCanvas.value.parentElement) return;

	patternScrollSliderPos.value = (displayCanvas.value.parentElement.scrollLeft) / (displayCanvas.value.width - displayCanvas.value.parentElement.offsetWidth) * 100;
	patternScrollSlider.value.style.opacity = '1';
}

function scrollEndHandle() {
	suppressScrollSliderWatcher = false;

	if (!patternScrollSlider.value) return;
	patternScrollSlider.value.style.opacity = '';
}

function handleScrollBarEnable() {
	patternScrollSliderShow.value = (!patternHide.value && !isTouchUsing);
	if (patternScrollSliderShow.value !== true) return;

	if (!displayCanvas.value) return;
	if (!displayCanvas.value.parentElement) return;
	if (firstFrame) {
		patternScrollSliderShow.value = (12 + 84 * player.value.getPatternNumRows(player.value.getPattern()) + 2 > displayCanvas.value.parentElement.offsetWidth);
	} else {
		patternScrollSliderShow.value = (displayCanvas.value.width > displayCanvas.value.parentElement.offsetWidth);
	}
}

watch(patternScrollSliderPos, () => {
	if (suppressScrollSliderWatcher) return;
	if (!displayCanvas.value) return;
	if (!displayCanvas.value.parentElement) return;

	displayCanvas.value.parentElement.scrollLeft = (displayCanvas.value.width - displayCanvas.value.parentElement.offsetWidth) * patternScrollSliderPos.value / 100;
});

onDeactivated(() => {
	stop();
});

</script>

<style lang="scss" scoped>

.hide {
	border-radius: var(--radius-sm) !important;
	background-color: black !important;
	color: var(--accentLighten) !important;
	font-size: 12px !important;
}

.mod-player-enabled {
	position: relative;
	overflow: hidden;
	display: flex;
	flex-direction: column;

	> i {
		display: block;
		position: absolute;
		border-radius: var(--radius-sm);
		background-color: var(--fg);
		color: var(--accentLighten);
		font-size: 14px;
		opacity: .5;
		padding: 3px 6px;
		text-align: center;
		cursor: pointer;
		top: 12px;
		right: 12px;
		z-index: 4;
	}

	> .pattern-display {
		width: 100%;
		height: 100%;
		overflow-x: scroll;
		overflow-y: hidden;
		background-color: black;
		text-align: center;
		max-height: 312px; /* magic_number = CHAR_HEIGHT * rowBuffer, needs to be in px */

		scrollbar-width: none;

		&::-webkit-scrollbar {
			display: none;
		}

		.pattern-canvas {
			position: relative;
			background-color: black;
			image-rendering: pixelated;
			pointer-events: none;
			z-index: 0;
		}

		.patternShadowTop {
			background: #00000080;
			width: 100%;
			height: calc( 50% - 14px );
			translate: 0 -100%;
			top: calc( 50% - 14px );
			position: absolute;
			pointer-events: none;
			z-index: 2;
		}

		.patternShadowBottom {
			background: #00000080;
			width: 100%;
			height: calc( 50% - 12px );
			top: calc( 50% - 1px );
			position: absolute;
			pointer-events: none;
			z-index: 2;
		}

		.pattern-hide {
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			background: rgba(64, 64, 64, 0.3);
			backdrop-filter: var(--modalBgFilter);
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
		background-color: var(--bg);
		z-index: 5;

		> * {
			padding: 4px 8px;
		}

		> button, a {
			border: none;
			background-color: transparent;
			color: var(--accent);
			cursor: pointer;

			&:hover {
				background-color: var(--fg);
			}
		}

		> input[type=range] {
			height: 21px;
			-webkit-appearance: none;
			width: 90px;
			padding: 0;
			margin: 4px 8px;
			overflow-x: hidden;

			&.pattern-slider {
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
					background: var(--bg);
				}

				&::-ms-fill-lower, &::-ms-fill-upper {
					background: var(--bg);
				}
			}

			&::-webkit-slider-runnable-track {
				width: 100%;
				height: 100%;
				cursor: pointer;
				border-radius: 0;
				animate: 0.2s;
				background: var(--bg);
				border: 1px solid var(--fg);
				overflow-x: hidden;
			}

			&::-webkit-slider-thumb {
				border: none;
				height: 100%;
				width: 14px;
				border-radius: 0;
				background: var(--accentLighten);
				cursor: pointer;
				-webkit-appearance: none;
				box-shadow: calc(-100vw - 14px) 0 0 100vw var(--accent);
				clip-path: polygon(1px 0, 100% 0, 100% 100%, 1px 100%, 1px calc(50% + 10.5px), -100vw calc(50% + 10.5px), -100vw calc(50% - 10.5px), 0 calc(50% - 10.5px));
				z-index: 1;
			}

			&::-moz-range-track {
				width: 100%;
				height: 100%;
				cursor: pointer;
				border-radius: 0;
				animate: 0.2s;
				background: var(--bg);
				border: 1px solid var(--fg);
			}

			&::-moz-range-progress {
				cursor: pointer;
				height: 100%;
				background: var(--accent);
			}

			&::-moz-range-thumb {
				border: none;
				height: 100%;
				border-radius: 0;
				width: 14px;
				background: var(--accentLighten);
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
				background: var(--accent);
				border: 1px solid var(--fg);
				border-radius: 0;
			}

			&::-ms-fill-upper {
				background: var(--bg);
				border: 1px solid var(--fg);
				border-radius: 0;
			}

			&::-ms-thumb {
				margin-top: 1px;
				border: none;
				height: 100%;
				width: 14px;
				border-radius: 0;
				background: var(--accentLighten);
				cursor: pointer;
			}

			&.progress {
				flex-grow: 1;
				min-width: 0;
			}
		}
	}
}

.mod-player-disabled {
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
