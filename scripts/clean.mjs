/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import nodeFs from 'node:fs/promises';
import nodePath from 'node:path';
import nodeCP from 'node:child_process';

const rootDir = nodePath.resolve(import.meta.dirname, '..');

/**
 * Root directories to search for cleanup targets.
 */
const searchRoots = [
	'.',
	'packages/misskey-js/generator',
	'packages/backend/test',
	'packages/backend/test-federation',
	'packages/backend/test-server',
].map(r => nodePath.resolve(rootDir, r));

// Add all packages as roots
const packagesDir = nodePath.resolve(rootDir, 'packages');
for (const pkg of await nodeFs.readdir(packagesDir, { withFileTypes: true })) {
	if (pkg.isDirectory()) {
		const pkgPath = nodePath.resolve(packagesDir, pkg.name);
		searchRoots.push(pkgPath);
	}
}

/**
 * @param {string} targetName
 * @returns {string[]}
 */
function appendToRoots(targetName) {
	return searchRoots.map(root => nodePath.resolve(root, targetName));
}

// https://nodejs.org/api/fs.html#fspromisesrmpath-options
const rmOpts = {
	recursive: true,
	force: true,
	maxRetries: searchRoots.length + 1,
	retryDelay: 500,
};

/**
 * https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<void>}
 */
function exec(command, ...args) {
	return new Promise((resolve, reject) => {
		const proc = nodeCP.spawn(command, args, {
			// Inherit stdin so ctrl-c will work.
			// Ignore stdout/stderr to suppress output.
			stdio: ['inherit', 'ignore', 'ignore'],
			// Suppress console popup on Windows.
			windowsHide: true,
			// Timeout after 1 minute in case it stalls or waits for interaction.
			timeout: 1000 * 60,
		});
		proc.once('error', reject);
		proc.once('exit', code => {
			if (code === 0) resolve();
			else reject(new Error(`Command "${[command, ...args].join(' ')}" returned non-zero code ${code}`));
		});
	});
}

/** @type {Promise<void>[]} */
const cleanTasks = process.argv
	.slice(2)
	.flatMap(arg => {
		const mode = arg.toLowerCase();

		if (mode === 'built') {
			console.log('Cleaning build artifacts...');
			const builtDirs = [
				...appendToRoots('built'),
				...appendToRoots('built-test'),
			];
			return builtDirs.map(builtDir => nodeFs.rm(builtDir, rmOpts));
		} else if (mode === 'deps') {
			console.log('Cleaning dependencies...');
			return appendToRoots('node_modules')
				.map(depDir => nodeFs.rm(depDir, rmOpts));
		} if (mode === 'submodules') {
			console.log('Cleaning submodules...');
			return exec('git', 'submodule', 'deinit', '--all');
		} else if (mode === 'gen') {
			console.log('Cleaning generated code...');
			return ['locales/index.d.ts', 'packages/misskey-js/src/autogen']
				.map(genName => nodePath.resolve(rootDir, genName))
				.map(genDir => nodeFs.rm(genDir, rmOpts));
		} else if (mode === 'temp') {
			console.log('Cleaning temporary files...');
			return appendToRoots('temp')
				.map(tempDir => nodeFs.rm(tempDir, rmOpts));
		} else if (mode === 'reports') {
			console.log('Cleaning test results...');
			return appendToRoots('coverage')
				.map(coverageDir => nodeFs.rm(coverageDir, rmOpts));
		} else {
			console.log(`Unsupported clean mode "${mode}"`);
			return [];
		}
	});

await Promise.all(cleanTasks);
await new Promise(resolve => setTimeout(resolve, 1000));
console.log('Cleanup complete.');

