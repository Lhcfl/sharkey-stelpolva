import tsParser from '@typescript-eslint/parser';
import sharedConfig from '../../shared/eslint.config.js';

// eslint-disable-next-line import/no-default-export
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
