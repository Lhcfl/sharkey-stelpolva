/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import cssnano from 'cssnano';
import postcss from 'postcss';
import * as terser from 'terser';
import { localesVersion } from '../locales/version.js';
import { build as buildLocales } from '../locales/index.js';
import generateDTS from '../locales/generateDTS.js';
import meta from '../package.json' with { type: 'json' };
import buildTarball from './tarball.mjs';

let locales = buildLocales();

/**
 * @returns {Promise<null | import('../packages/backend/src/config.ts').Config>}
 */
async function loadConfig() {
	try {
		// @ts-ignore 我也不知道这怎么该，这太奇怪了
		const { loadConfig } = await import('../packages/backend/built/config.js');
		return loadConfig();
	} catch (err) {
		console.warn('Failed to load config for build-assets. This is expected for the first build, but is an error otherwise.', err);
		return null;
	}
}

async function copyFrontendFonts() {
	await fs.cp('./packages/frontend/node_modules/three/examples/fonts', './built/_frontend_dist_/fonts', { dereference: true, recursive: true });
}

async function copyFrontendTablerIcons() {
	await fs.cp('./packages/frontend/node_modules/@phosphor-icons/web/src', './built/_frontend_dist_/phosphor-icons', { dereference: true, recursive: true });

	for (const file of [
		'./built/_frontend_dist_/phosphor-icons/bold/style.css',
		'./built/_frontend_dist_/phosphor-icons/duotone/style.css',
		'./built/_frontend_dist_/phosphor-icons/fill/style.css',
		'./built/_frontend_dist_/phosphor-icons/light/style.css',
		'./built/_frontend_dist_/phosphor-icons/regular/style.css',
		'./built/_frontend_dist_/phosphor-icons/thin/style.css',
	]) {
		let source = await fs.readFile(file, { encoding: 'utf-8' });
		source = source.replaceAll(/(url\(.+?Phosphor.+?\.(?:[a-zA-Z0-9]+))/g, `$1?version=${meta.version}`);
		await fs.writeFile(file, source);
	}
}

async function copyFrontendLocales() {
	generateDTS();

	await fs.mkdir('./built/_frontend_dist_/locales', { recursive: true });

	const v = { '_version_': localesVersion };

	for (const [lang, locale] of Object.entries(locales)) {
		await fs.writeFile(`./built/_frontend_dist_/locales/${lang}.${localesVersion}.json`, JSON.stringify({ ...locale, ...v }), 'utf-8');
	}
}

async function copyBackendViews() {
	await fs.cp('./packages/backend/src/server/web/views', './packages/backend/built/server/web/views', { recursive: true });
}

async function buildBackendScript() {
	await fs.mkdir('./packages/backend/built/server/web', { recursive: true });

	for (const file of [
		'./packages/backend/src/server/web/boot.js',
		'./packages/backend/src/server/web/boot.embed.js',
		'./packages/backend/src/server/web/bios.js',
		'./packages/backend/src/server/web/cli.js',
		'./packages/backend/src/server/web/error.js',
	]) {
		let source = await fs.readFile(file, { encoding: 'utf-8' });
		source = source.replaceAll(/\bLANGS\b/g, JSON.stringify(Object.keys(locales)));
		source = source.replaceAll(/\bLANGS_VERSION\b/g, JSON.stringify(localesVersion));
		const { code } = await terser.minify(source, { toplevel: true });
		await fs.writeFile(`./packages/backend/built/server/web/${path.basename(file)}`, code ?? '');
	}
}

async function buildBackendStyle() {
	await fs.mkdir('./packages/backend/built/server/web', { recursive: true });

	for (const file of [
		'./packages/backend/src/server/web/style.css',
		'./packages/backend/src/server/web/style.embed.css',
		'./packages/backend/src/server/web/bios.css',
		'./packages/backend/src/server/web/cli.css',
		'./packages/backend/src/server/web/error.css',
	]) {
		const source = await fs.readFile(file, { encoding: 'utf-8' });
		// @ts-expect-error unclear whether this option is still supported; preserving
		const { css } = await postcss([cssnano({ zindex: false })]).process(source, { from: undefined });
		await fs.writeFile(`./packages/backend/built/server/web/${path.basename(file)}`, css);
	}
}

async function build() {
	await Promise.all([
		copyFrontendFonts(),
		copyFrontendTablerIcons(),
		copyFrontendLocales(),
		copyBackendViews(),
		buildBackendScript(),
		buildBackendStyle(),
		loadConfig().then(async config => {
			if (config?.publishTarballInsteadOfProvideRepositoryUrl) {
				await buildTarball();
			}
		}),
	]);
}

if (!process.argv.includes('--fast')) {
	await build();
}

if (process.argv.includes('--watch')) {
	['./locales', './sharkey-locales', './stpv-locales'].forEach(async (dir) => {
		const watcher = fs.watch(dir);
		for await (const event of watcher) {
			const filename = event.filename?.replaceAll('\\', '/');
			if (filename && /^[a-z]+-[A-Z]+\.yml/.test(filename)) {
				console.log(`update ${filename} ...`);
				locales = buildLocales();
				await copyFrontendLocales();
			}
		}
	});
}
