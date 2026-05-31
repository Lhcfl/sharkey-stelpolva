import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import sharedConfig from './packages/shared/eslint.config.js';

// eslint-disable-next-line import/no-default-export
export default [
	...sharedConfig,
	{
		files: ['*.js', '*.mjs', '*.ts', '*.mts'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				project: ['tsconfig.json'],
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname,
			},
			globals: {
				...globals.node,
			},
		},
	},
	{
		files: ['*.cjs', '*.cts'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				project: ['tsconfig.json'],
				sourceType: 'commonjs',
				tsconfigRootDir: import.meta.dirname,
			},
			globals: {
				...globals.node,
			},
		},
		rules: {
			'@typescript-eslint/no-require-imports': 'off',
		},
	},
	{
		files: ['scripts/**/*'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				project: ['scripts/tsconfig.json'],
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname,
			},
			globals: {
				...globals.node,
			},
		},
	},
	{
		files: ['cypress/**/*'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				project: ['cypress/tsconfig.json'],
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname,
			},
			globals: {
				...globals.browser,
				...globals.jest,
			},
		},
	},
];
