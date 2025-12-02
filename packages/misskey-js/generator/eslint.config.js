import tsParser from '@typescript-eslint/parser';
import sharedConfig from '../../shared/eslint.config.js';

export default [
	...sharedConfig,
	{
		files: ['src/**/*.ts', 'src/**/*.tsx'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				project: ['./tsconfig.generator.json'],
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ['built/autogen/**.ts'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				project: ['./tsconfig.autogen.json'],
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'@stylistic/indent': 'off',
		},
	},
	{
		files: ['*.js'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				project: ['./tsconfig.scripts.json'],
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		ignores: [
			'**/node_modules',
		],
	},
];
