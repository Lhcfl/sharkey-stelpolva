import tsParser from '@typescript-eslint/parser';
import sharedConfig from '../shared/eslint.config.js';
import globals from 'globals';

export default [
	...sharedConfig,
	{
		ignores: ['**/node_modules', 'built', '@types/**/*', 'migration'],
	},
	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				project: ['./tsconfig.json', './test/tsconfig.json'],
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'import/order': ['warn', {
				groups: [
					'builtin',
					'external',
					'internal',
					'parent',
					'sibling',
					'index',
					'object',
					'type',
				],
				pathGroups: [{
					pattern: '@/**',
					group: 'external',
					position: 'after',
				}],
			}],
			'no-restricted-globals': ['error', {
				name: '__dirname',
				message: 'Not in ESModule. Use `import.meta.url` instead.',
			}, {
				name: '__filename',
				message: 'Not in ESModule. Use `import.meta.url` instead.',
			}],
		},
	},
	{
		files: ['src/server/web/**/*.js', 'src/server/web/**/*.ts'],
		languageOptions: {
			globals: {
				...globals.browser,
				LANGS: true,
				CLIENT_ENTRY: true,
				LANGS_VERSION: true,
			},
		},
	},
	{
		ignores: [
			"**/lib/",
			"**/temp/",
			"**/built/",
			"**/coverage/",
			"**/node_modules/",
			"**/migration/",
		]
	},
];
