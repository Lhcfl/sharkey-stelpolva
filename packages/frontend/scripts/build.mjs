/**
 * Hot-swaps tsconfig files to work around vite limitations.
 * Based on idea from https://github.com/vitejs/vite/discussions/8483#discussioncomment-6830634
 */

import nodeFs from 'node:fs/promises';
import nodePath from 'node:path';
import { execa } from 'execa';

const rootDir = nodePath.resolve(import.meta.dirname, '../');
const tsConfig = nodePath.resolve(rootDir, 'tsconfig.json');
const tsConfigBak = nodePath.resolve(rootDir, 'tsconfig.json.bak');
const tsConfigVue = nodePath.resolve(rootDir, 'tsconfig.vue.json');

const mode = process.argv.slice(2).includes('--watch') ? 'watch' : 'build';

console.log('Staging tsconfig.vue.json as tsconfig.json...');
await nodeFs.rename(tsConfig, tsConfigBak);
await nodeFs.copyFile(tsConfigVue, tsConfig);

try {
	console.log('Starting vite...');
	await execa(
		'vite',
		mode === 'build'
			? ['build']
			: [],
		{
			stdout: process.stdout,
			stderr: process.stderr,
		},
	);
} finally {
	console.log('Restoring original tsconfig.json...');
	await nodeFs.rm(tsConfig);
	await nodeFs.rename(tsConfigBak, tsConfig);
}
