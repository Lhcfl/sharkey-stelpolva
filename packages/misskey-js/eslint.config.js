import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import sharedConfig from '../shared/eslint.config.js';

// eslint-disable-next-line import/no-default-export
export default [
	...sharedConfig,
	{
		ignores: [
			'generator',
			'temp',
			'built',
			'coverage',
			'node_modules',
		],
	},
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				project: ['src/tsconfig.json'],
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ['test/**/*.ts'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				projectService: ['test/tsconfig.json'],
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ['test-d/**/*.ts'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				projectService: ['test-d/tsconfig.json'],
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ['*.ts', '*.js', 'scripts/**/*.ts', 'scripts/**/*.js', 'scripts/**/*.mjs', 'scripts/**/*.cjs'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				project: ['tsconfig.scripts.json'],
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname,
			},
			globals: {
				...globals.node,
			},
		},
	},
	{
		files: ['src/autogen/**/*.ts', 'src/autogen/**/*.tsx'],
		rules: {
			'@stylistic/indent': 'off',
		},
	},
];
