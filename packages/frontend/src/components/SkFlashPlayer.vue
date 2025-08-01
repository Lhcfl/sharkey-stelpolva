<!--
SPDX-FileCopyrightText: CenTdemeern1 and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

Displays a Flash Player window via Ruffle.
-->

<template>
<div :class="$style.flash_player_container">
	<canvas :class="$style.ratio" height="300" width="300"></canvas>

	<div v-if="hide" :class="$style.flash_player_disabled" @click="toggleVisible()">
		<div>
			<b><i class="ph-eye ph-bold ph-lg"></i> {{ i18n.ts.sensitive }}</b>
			<span>{{ i18n.ts.clickToShow }}</span>
		</div>
	</div>

	<div v-else :class="$style.flash_player_enabled">
		<div :class="$style.flash_display">
			<div v-if="playerHide" :class="$style.player_hide" @click="dismissWarning()">
				<b><i class="ph-eye ph-bold ph-lg"></i> {{ i18n.ts._flash.contentHidden }}</b>
				<span>{{ i18n.ts._flash.poweredByRuffle }}</span>
				<span>{{ i18n.ts._flash.arbitraryCodeExecutionWarning }}</span>
				<span>{{ i18n.ts.clickToShow }}</span>
			</div>
			<div v-if="ruffleError" :class="$style.player_hide">
				<b><i class="ph-warning ph-bold ph-lg"></i> {{ i18n.ts._flash.failedToLoad }}</b>
				<code>{{ ruffleError }}</code>
			</div>
			<div v-else-if="loadingStatus" :class="$style.player_hide">
				<b>{{ i18n.ts._flash.isLoading }}<MkEllipsis/></b>
				<MkLoading/>
				<p>{{ loadingStatus }}</p>
			</div>
			<div ref="ruffleContainer" :class="$style.container"></div>
		</div>
		<div :class="$style.controls">
			<button :key="playPauseButtonKey" @click="playPause()">
				<i v-if="player?.isPlaying" class="ph-pause ph-bold ph-lg"></i>
				<i v-else class="ph-play ph-bold ph-lg"></i>
			</button>
			<button :disabled="playerHide" @click="stop()">
				<i class="ph-stop ph-bold ph-lg"></i>
			</button>
			<input v-if="player && !playerHide" v-model="player.volume" type="range" min="0" max="1" step="0.1"/>
			<input v-else type="range" min="0" max="1" value="1" disabled/>
			<a :title="i18n.ts.download" :href="flashFile.url" :download="flashFile.name" target="_blank">
				<i class="ph-download ph-bold ph-lg"></i>
			</a>
			<button :class="$style.fullscreen" :disabled="playerHide" @click="fullscreen()">
				<i class="ph-arrows-out ph-bold ph-lg"></i>
			</button>
		</div>
		<div v-if="comment" :class="$style.alt" :title="comment">ALT</div>
		<i :class="$style.hide" class="ph-eye-slash ph-bold ph-lg" @click="toggleVisible()"></i>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, onDeactivated } from 'vue';
import * as Misskey from 'misskey-js';
import type { PublicAPI, PublicAPILike } from '@/types/ruffle/setup';
import type { PlayerElement } from '@/types/ruffle/player';
import MkEllipsis from '@/components/global/MkEllipsis.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	flashFile: Misskey.entities.DriveFile
}>();

const isSensitive = props.flashFile.isSensitive;
const url = props.flashFile.url;
const comment = props.flashFile.comment ?? '';
let hide = ref((prefer.s.nsfw === 'force') || isSensitive && (prefer.s.nsfw !== 'ignore'));
let playerHide = ref(true);
let ruffleContainer = ref<HTMLDivElement>();
let playPauseButtonKey = ref<number>(0);
let loadingStatus = ref<string | undefined>(undefined);
let player = ref<PlayerElement | undefined>(undefined);
let ruffleError = ref<string | undefined>(undefined);

async function dismissWarning() {
	playerHide.value = false;
	try {
		await loadRuffle();
		createPlayer();
		await loadContent();
	} catch (error) {
		handleError(error);
	}
}

function handleError(error: unknown) {
	if (error instanceof Error) ruffleError.value = error.stack;
	else ruffleError.value = `${error}`; // Fallback for if something is horribly wrong
}

/**
 * @throws if esm.sh shits itself
 */
async function loadRuffle() {
	if (window.RufflePlayer !== undefined) return;
	loadingStatus.value = i18n.ts._flash.loadingRufflePlayer;
	await import('@ruffle-rs/ruffle'); // Assumption: this will throw if esm.sh has a hiccup or something. If not, the next undefined check will catch it.
	window.RufflePlayer = window.RufflePlayer as PublicAPILike | PublicAPI | undefined; // Assert unknown type due to side effects
	if (window.RufflePlayer === undefined) throw Error('esm.sh has shit itself, but not in an expected way (has esm.sh permanently shut down? how close is the heat death of the universe?)');

	window.RufflePlayer.config = {
		// Options affecting the whole page
		'publicPath': `https://raw.esm.sh/@ruffle-rs/ruffle@${_RUFFLE_VERSION_}/`,
		'polyfills': false,

		// Options affecting files only
		'allowScriptAccess': false,
		'autoplay': true,
		'unmuteOverlay': 'visible',
		'backgroundColor': null,
		'wmode': 'window',
		'letterbox': 'on',
		'warnOnUnsupportedContent': true,
		'contextMenu': 'off', // Prevent two overlapping context menus. Most of the stuff in this context menu is available in the controls below the player.
		'showSwfDownload': false, // Handled by custom download button
		'upgradeToHttps': window.location.protocol === 'https:',
		'maxExecutionDuration': 15,
		'logLevel': 'error',
		'base': null,
		'popupMenu': true,
		'salign': '',
		'forceAlign': false,
		'scale': 'showAll',
		'forceScale': false,
		'frameRate': null,
		'quality': 'high',
		'splashScreen': false,
		'preferredRenderer': null,
		'openUrlMode': 'deny',
		'allowNetworking': 'none',
		'favorFlash': false,
		'socketProxy': [],
		'fontSources': [],
		'defaultFonts': {},
		'credentialAllowList': [],
		'playerRuntime': 'flashPlayer',
		'allowFullscreen': false, // Handled by custom fullscreen button
	};
}

/**
 * @throws If `ruffle.newest()` fails (impossible)
 */
function createPlayer() {
	if (player.value !== undefined) return;
	const ruffle = (() => {
		const ruffleAPI = (window.RufflePlayer as PublicAPI).newest();
		if (ruffleAPI === null) {
			// This error exists because non-null assertions are forbidden, apparently.
			throw Error('Ruffle could not get the latest Ruffle source. Since we\'re loading from esm.sh this is genuinely impossible and you must\'ve done something incredibly cursed.');
		}
		return ruffleAPI;
	})();
	player.value = ruffle.createPlayer();
	player.value.style.width = '100%';
	player.value.style.height = '100%';
}

/**
 * @throws If `player.value` is uninitialized.
 */
async function loadContent() {
	if (player.value === undefined) throw Error('Player is uninitialized.');
	ruffleContainer.value?.appendChild(player.value);
	loadingStatus.value = i18n.ts._flash.loadingFlashFile;
	try {
		await player.value.load(url);
		loadingStatus.value = undefined;
	} catch (error) {
		try {
			await window.fetch('https://raw.esm.sh/', {
				mode: 'cors',
			});
			handleError(error); // Unexpected error
		} catch {
			// Must be CSP because esm.sh should be online if `loadRuffle()` didn't fail
			handleError(i18n.ts._flash.cspError);
		}
	}
}

function playPause() {
	if (playerHide.value) {
		dismissWarning();
		return;
	}
	if (player.value === undefined) return; // Not done loading or something
	if (player.value.isPlaying) {
		player.value.pause();
	} else {
		player.value.play();
	}
	playPauseButtonKey.value += 1; // HACK: Used to re-render play/pause button
}

function fullscreen() {
	if (player.value === undefined) return; // Can't fullscreen an element that doesn't exist.
	if (player.value.isFullscreen) {
		player.value.exitFullscreen();
	} else {
		player.value.enterFullscreen();
	}
}

function stop() {
	if (player.value === undefined) return; // FIXME: This doesn't stop the loading process. (That said, should this even be implemented?)
	try {
		ruffleContainer.value?.removeChild(player.value);
	} catch {
		// This is fine
	}
	playerHide.value = true;
}

function toggleVisible() {
	hide.value = !hide.value;
	playerHide.value = true;
}

onDeactivated(() => {
	stop();
});

</script>

<style lang="scss" module>

.flash_player_container {
	position: relative;
	min-height: 0;
}

.ratio {
	width: 100%;
}

.hide {
	border-radius: var(--MI-radius-sm) !important;
	background-color: black !important;
	color: var(--MI_THEME-accentLighten) !important;
	font-size: 12px !important;
}

.flash_player_enabled {
	overflow: hidden;
	display: flex;
	flex-direction: column;
	position: absolute;
	inset: 0;

	> i {
		display: block;
		position: absolute;
		border-radius: var(--MI-radius-sm);
		background-color: var(--MI_THEME-fg);
		color: var(--MI_THEME-accentLighten);
		font-size: 14px;
		opacity: .5;
		padding: 3px 6px;
		text-align: center;
		cursor: pointer;
		top: 12px;
		right: 12px;
		z-index: 4;
	}

	> .alt {
		display: block;
		position: absolute;
		border-radius: var(--MI-radius-sm);
		background-color: black;
		color: var(--MI_THEME-accentLighten);
		font-size: 0.8em;
		font-weight: bold;
		opacity: .5;
		padding: 2px 5px;
		cursor: help;
		user-select: none;
		top: 12px;
		left: 12px;
		z-index: 4;
	}

	> .flash_display {
		width: 100%;
		height: 100%;
		flex-grow: 10;
		overflow-x: scroll;
		overflow-y: hidden;
		background-color: black;
		text-align: center;

		scrollbar-width: none;

		&::-webkit-scrollbar {
			display: none;
		}

		.player_hide {
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			background: rgba(64, 64, 64, 0.3);
			backdrop-filter: var(--MI-modalBgFilter);
			color: #fff;
			font-size: 12px;
			border-radius: var(--MI-radius-sm);

			position: absolute;
			z-index: 4;
			width: 100%;
			height: 100%;

			> span {
				display: block;
			}
		}

		> .container {
			height: 100%;
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
			text-decoration: none;
			cursor: pointer;

			&:hover {
				background-color: var(--MI_THEME-fg);
			}

			&:disabled {
				filter: grayscale(100%);
				background-color: transparent;
				cursor: not-allowed;
			}
		}

		> .fullscreen {
			margin-left: auto;

			&:disabled {
				filter: grayscale(100%);
			}
		}

		> input[type=range] {
			height: 21px;
			-webkit-appearance: none;
			width: 90px;
			padding: 0;
			margin: 4px 8px;
			overflow-x: hidden;
			cursor: pointer;

			&:disabled {
				filter: grayscale(100%);
				cursor: not-allowed;
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
				background: var(--MI_THEME-accentLighten);
				-webkit-appearance: none;
				box-shadow: calc(-100vw - 14px) 0 0 100vw var(--MI_THEME-accent);
				clip-path: polygon(1px 0, 100% 0, 100% 100%, 1px 100%, 1px calc(50% + 10.5px), -100vw calc(50% + 10.5px), -100vw calc(50% - 10.5px), 0 calc(50% - 10.5px));
				z-index: 1;
			}

			&::-moz-range-track {
				width: 100%;
				height: 100%;
				border-radius: 0;
				animate: 0.2s;
				background: var(--MI_THEME-bg);
				border: 1px solid var(--MI_THEME-fg);
			}

			&::-moz-range-progress {
				height: 100%;
				background: var(--MI_THEME-accent);
			}

			&::-moz-range-thumb {
				border: none;
				height: 100%;
				border-radius: 0;
				width: 14px;
				background: var(--MI_THEME-accentLighten);
			}

			&::-ms-track {
				width: 100%;
				height: 100%;
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
				background: var(--MI_THEME-accentLighten);
			}
		}
	}
}

.flash_player_disabled {
	display: flex;
	justify-content: center;
	align-items: center;
	background: #111;
	color: #fff;
	position: absolute;
	inset: 0;

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
