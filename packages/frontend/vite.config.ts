import path from 'path';
import pluginReplace from '@rollup/plugin-replace';
import type { RollupReplaceOptions } from '@rollup/plugin-replace';
import pluginVue from '@vitejs/plugin-vue';
import { type UserConfig, defineConfig } from 'vite';

import locales from '../../locales/index.js';
import meta from '../../package.json';
import packageInfo from './package.json' assert { type: 'json' };
import pluginUnwindCssModuleClassName from './lib/rollup-plugin-unwind-css-module-class-name.js';
import pluginJson5 from './vite.json5.js';

const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.json5', '.svg', '.sass', '.scss', '.css', '.vue', '.wasm'];

/**
 * Misskeyのフロントエンドにバンドルせず、CDNなどから別途読み込むリソースを記述する。
 * CDNを使わずにバンドルしたい場合、以下の配列から該当要素を削除orコメントアウトすればOK
 */
const externalPackages = [
	// shiki（コードブロックのシンタックスハイライトで使用中）はテーマ・言語の定義の容量が大きいため、それらはCDNから読み込む
	{
		name: 'shiki',
		match: /^shiki\/(?<subPkg>(langs|themes))$/,
		path(id: string, pattern: RegExp): string {
			const match = pattern.exec(id)?.groups;
			return match
				? `https://esm.sh/shiki@${packageInfo.dependencies.shiki}/${match['subPkg']}`
				: id;
		},
	},
];

const hash = (str: string, seed = 0): number => {
	let h1 = 0xdeadbeef ^ seed,
		h2 = 0x41c6ce57 ^ seed;
	for (let i = 0, ch; i < str.length; i++) {
		ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}

	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

	return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

const BASE62_DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function toBase62(n: number): string {
	if (n === 0) {
		return '0';
	}
	let result = '';
	while (n > 0) {
		result = BASE62_DIGITS[n % BASE62_DIGITS.length] + result;
		n = Math.floor(n / BASE62_DIGITS.length);
	}

	return result;
}

function iconsReplace(opts: RollupReplaceOptions) {
	return pluginReplace({
		...opts,
		preventAssignment: false,
		// only replace these strings at the start of strings, remove a
		// `ti-fw` it if happens to be just after, and make sure they're
		// followed by a word-boundary that's not a dash
		delimiters: ['(?<=["\'`])', '(?: ti-fw)?\\b(?!-)'],
	});
}

export function getConfig(): UserConfig {
	return {
		base: '/vite/',

		server: {
			port: 5173,
		},

		plugins: [
			pluginVue(),
			pluginUnwindCssModuleClassName(),
			pluginJson5(),
			iconsReplace({
				values: {
					'ti ti-alert-triangle': 'ph-warning ph-bold ph-lg',
				},
				exclude: [
					'**/components/MkAnnouncementDialog.*',
					'**/pages/announcement.*',
				],
			}),
			iconsReplace({
				values: {
					'ti ti-alert-triangle': 'ph-warning-circle ph-bold ph-lg',
				},
				include: [
					'**/components/MkAnnouncementDialog.*',
					'**/pages/announcement.*',
				],
			}),
			iconsReplace({
				values: {
					'ti ti-reload': 'ph-arrow-clockwise ph-bold ph-lg',
				},
				exclude: [
					'**/pages/settings/emoji-picker.*',
					'**/pages/flash/flash.*',
				],
			}),
			iconsReplace({
				values: {
					'ti ti-reload': 'ph-arrow-counter-clockwise ph-bold ph-lg',
				},
				include: [
					'**/pages/settings/emoji-picker.*',
				],
			}),
			iconsReplace({
				values: {
					'ti ti-reload': 'ph-arrows-clockwise ph-bold ph-lg',
				},
				include: [
					'**/pages/flash/flash.*',
				],
			}),
		iconsReplace({
				values: {
					'ti ti-terminal-2': 'ph-terminal-window ph-bold ph-lg',
					'ti ti-download': 'ph-download ph-bold ph-lg',
					'ti ti-circle-x': 'ph-x-circle ph-bold ph-lg',
					'ti ti-plus': 'ph-plus ph-bold ph-lg',
					'ti ti-planet': 'ph-planet ph-bold ph-lg',
					'ti ti-world-x': 'ph-planet ph-bold ph-lg',
					'ti ti-world-search': 'ph-planet ph-bold ph-lg',
					'ti ti-chevron-right': 'ph-caret-right ph-bold ph-lg',
					'ti ti-chevrons-right': 'ph-caret-right ph-bold ph-lg',
					'ti ti-dots': 'ph-dots-three ph-bold ph-lg',
					'ti ti-check': 'ph-check ph-bold ph-lg',
					'ti ti-device-floppy': 'ph-floppy-disk ph-bold ph-lg',
					'ti ti-shield': 'ph-shield ph-bold ph-lg',
					'ti ti-shield-lock': 'ph-shield ph-bold ph-lg',
					'ti ti-confetti': 'ph-confetti ph-bold ph-lg',
					'ti ti-home': 'ph-house ph-bold ph-lg',
					'ti ti-clock': 'ph-clock ph-bold ph-lg',
					'ti ti-pencil': 'ph-pencil-simple ph-bold ph-lg',
					'ti ti-arrow-right': 'ph-arrow-right ph-bold ph-lg',
					'ti ti-pin': 'ph-push-pin ph-bold ph-lg',
					'ti ti-heart': 'ph-heart ph-bold ph-lg',
					'ti ti-heart-filled': 'ph-heart ph-bold ph-lg',
					'ti ti-heart-plus': 'ph-heart ph-bold ph-lg',
					'ti ti-arrow-left': 'ph-arrow-left ph-bold ph-lg',
					'ti ti-settings': 'ph-gear ph-bold ph-lg',
					'ti ti-link': 'ph-link ph-bold ph-lg',
					'ti ti-key': 'ph-key ph-bold ph-lg',
					'ti ti-code': 'ph-code ph-bold ph-lg',
					'ti ti-star': 'ph-star ph-bold ph-lg',
					'ti ti-eye': 'ph-eye ph-bold ph-lg',
					'ti ti-eye-off': 'ti ti-eye-exclamation',
					'ti ti-eye-exclamation': 'ph-eye-slash ph-bold ph-lg',
					'ti ti-lock': 'ph-lock ph-bold ph-lg',
					'ti ti-users': 'ph-users ph-bold ph-lg',
					'ti ti-exclamation-circle': 'ph-warning-circle ph-bold ph-lg',
					'ti ti-user-exclamation': 'ph-warning-circle ph-bold ph-lg',
					'ti ti-info-circle': 'ph-info ph-bold ph-lg',
					'ti ti-checklist': 'ph-list-checks ph-bold ph-lg',
					'ti ti-plane-departure': 'ph-airplane-takeoff ph-bold ph-lg',
					'ti ti-minus': 'ph-minus ph-bold ph-lg',
					'ti ti-device-tv': 'ph-television ph-bold ph-lg',
					'ti ti-cookie': 'ph-cookie ph-bold ph-lg',
					'ti ti-copy': 'ph-copy ph-bold ph-lg',
					'ti ti-chevron-up': 'ph-caret-up ph-bold ph-lg',
 					'ti ti-chevron-down': 'ph-caret-down ph-bold ph-lg',
 					'ti ti-caret-down': 'ph-caret-down ph-bold ph-lg',
				},
			}),
			...process.env.NODE_ENV === 'production'
				? [
					pluginReplace({
						preventAssignment: true,
						values: {
							'isChromatic()': JSON.stringify(false),
						},
					}),
				]
				: [],
		],

		resolve: {
			extensions,
			alias: {
				'@/': __dirname + '/src/',
				'/client-assets/': __dirname + '/assets/',
				'/static-assets/': __dirname + '/../backend/assets/',
				'/fluent-emojis/': __dirname + '/../../fluent-emojis/dist/',
				'/tossface/': __dirname + '/../../tossface-emojis/dist/',
				'/fluent-emoji/': __dirname + '/../../fluent-emojis/dist/',
			},
		},

		css: {
			modules: {
				generateScopedName(name, filename, _css): string {
					const id = (path.relative(__dirname, filename.split('?')[0]) + '-' + name).replace(/[\\\/\.\?&=]/g, '-').replace(/(src-|vue-)/g, '');
					const shortId = id.replace(/^(components(-global)?|widgets|ui(-_common_)?)-/, '');
					return shortId + '-' + toBase62(hash(id)).substring(0, 4);
				},
			},
		},

		define: {
			_VERSION_: JSON.stringify(meta.version),
			_LANGS_: JSON.stringify(Object.entries(locales).map(([k, v]) => [k, v._lang_])),
			_ENV_: JSON.stringify(process.env.NODE_ENV),
			_DEV_: process.env.NODE_ENV !== 'production',
			_PERF_PREFIX_: JSON.stringify('Misskey:'),
			_DATA_TRANSFER_DRIVE_FILE_: JSON.stringify('mk_drive_file'),
			_DATA_TRANSFER_DRIVE_FOLDER_: JSON.stringify('mk_drive_folder'),
			_DATA_TRANSFER_DECK_COLUMN_: JSON.stringify('mk_deck_column'),
			__VUE_OPTIONS_API__: true,
			__VUE_PROD_DEVTOOLS__: false,
		},

		build: {
			target: [
				'chrome116',
				'firefox116',
				'safari16',
			],
			manifest: 'manifest.json',
			rollupOptions: {
				input: {
					app: './src/_boot_.ts',
				},
				external: externalPackages.map(p => p.match),
				output: {
					manualChunks: {
						vue: ['vue'],
						photoswipe: ['photoswipe', 'photoswipe/lightbox', 'photoswipe/style.css'],
					},
					chunkFileNames: process.env.NODE_ENV === 'production' ? '[hash:8].js' : '[name]-[hash:8].js',
					assetFileNames: process.env.NODE_ENV === 'production' ? '[hash:8][extname]' : '[name]-[hash:8][extname]',
					paths(id) {
						for (const p of externalPackages) {
							if (p.match.test(id)) {
								return p.path(id, p.match);
							}
						}

						return id;
					},
				},
			},
			cssCodeSplit: true,
			outDir: __dirname + '/../../built/_vite_',
			assetsDir: '.',
			emptyOutDir: false,
			sourcemap: process.env.NODE_ENV === 'development',
			reportCompressedSize: false,

			// https://vitejs.dev/guide/dep-pre-bundling.html#monorepos-and-linked-dependencies
			commonjsOptions: {
				include: [/misskey-js/, /misskey-reversi/, /misskey-bubble-game/, /node_modules/],
			},
		},

		worker: {
			format: 'es',
		},

		test: {
			environment: 'happy-dom',
			deps: {
				optimizer: {
					web: {
						include: [
							// XXX: misskey-dev/browser-image-resizer has no "type": "module"
							'browser-image-resizer',
						],
					},
				},
			},
			includeSource: ['src/**/*.ts'],
		},
	};
}

const config = defineConfig(({ command, mode }) => getConfig());

export default config;
