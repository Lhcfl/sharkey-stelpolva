import tsParser from '@typescript-eslint/parser';
import sharedConfig from '../../shared/eslint.config.js';

// eslint-disable-next-line import/no-default-export
export default [
	// Remove excludes for built/**/*
	...sharedConfig.map(c => ({
		...c,
		ignores: c.ignores?.filter(i => !i.match(/\/built([\/\*]*)$/)) ?? [],
	})),
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
];
