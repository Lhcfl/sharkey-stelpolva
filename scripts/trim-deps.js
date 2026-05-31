/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// trims dependencies for production
// only run after a full build

import fs from 'node:fs';

// Sections within package.json to search
const checks = ['dependencies', 'optionalDependencies', 'devDependencies', 'peerDependencies'];

// Standard list of deps that will *only* be used in development, and thus can always be removed
const defaultPatterns = [
	// Build tooling
	/^@types\//, 'typescript', /^@swc\//, 'tsc-alias', 'rollup', /^@rollup\//, 'esbuild', 'sass', 'vite', /^vite-plugin-/,
	// Lint tooling
	'eslint', /^eslint-/, /^@typescript-eslint\//, '@misskey-dev/eslint-plugin', 'prettier',
	// Test tooling
	'jest', /^jest-/, /^@jest\//, 'ts-jest', '@testing-library/vue', 'start-server-and-test', 'vitest', /^vitest-/, '@nestjs/testing', 'aws-sdk-client-mock', 'supertest',
	// Dev tooling
	'nodemon', 'ts-node', 'cross-env', 'tsx',
	// Doc tooling
	'@microsoft/api-extractor', 'storybook', /^@storybook\//,
];

/**
 * @param {string} path
 * @param {(string | RegExp)[]} [patterns]
 */
function removeDeps(path, patterns = []) {
	let pkg = JSON.parse(fs.readFileSync(path, 'utf-8'));

	// Apply default patterns
	patterns = [...defaultPatterns, ...patterns];

	// Search each section of the package.json
	for (const check of checks) {
		const section = pkg[check];
		if (section == null || typeof(section) !== 'object') continue;

		// Run each pattern across the section
		for (const pattern of patterns) {
			// String patterns are easy, just delete the key.
			// delete operator is a no-op for missing properties.
			if (typeof(pattern) === 'string') {
				delete pkg[check][pattern];
			}

			if (pattern instanceof RegExp) {
				// For regex patterns, loop across each dep and test.
				for (const dep in section) {
					if (typeof(dep) !== 'string') continue;

					// Delete any package that matches the pattern.
					if (pattern.test(dep)) {
						delete pkg[check][dep];
					}
				}
			}
		}
	}

	fs.writeFileSync(path, JSON.stringify(pkg, undefined, 2));
}

removeDeps('package.json', ['execa', 'cssnano', 'postcss', 'terser']);
removeDeps('packages/backend/package.json', ['bufferutil', 'utf-8-validate', 'fkill', 'pid-port', 'simple-oauth2']);
removeDeps('packages/frontend/package.json', ['@misskey-dev/summaly', 'estree-walker', 'execa', 'fast-glob', 'happy-dom', 'intersection-observer']);
removeDeps('packages/frontend-embed/package.json', ['@misskey-dev/summaly', 'estree-walker', 'execa', 'fast-glob', 'happy-dom', 'intersection-observer']);
removeDeps('packages/frontend-shared/package.json', ['execa', 'vue-eslint-parser']);
removeDeps('packages/megalodon/package.json');
removeDeps('packages/misskey-bubble-game/package.json', ['execa', 'fast-glob']);
removeDeps('packages/misskey-js/package.json', ['@simplewebauthn/server', 'mock-socket', 'ncp', 'tsd']);
removeDeps('packages/misskey-js/generator/package.json', ['@readme/openapi-parser', '@redocly/openapi-core', /^openapi-/]);
removeDeps('packages/misskey-reversi/package.json', ['execa', 'fast-glob']);
removeDeps('packages/stub/package.json');
removeDeps('packages/sw/package.json');
removeDeps('locales/package.json', ['js-yaml']);
