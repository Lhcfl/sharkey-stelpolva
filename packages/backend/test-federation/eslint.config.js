import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import pluginMisskey from '@misskey-dev/eslint-plugin';

export default [
	{
		ignores: [
			"**/built/",
			'*.js',
		],
	},
	{
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
	{
		...pluginMisskey.configs['typescript'],
		files: ['daemon.ts', 'test/**/*.ts'],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				project: ['./tsconfig.json'],
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					"selector": "CallExpression[callee.property.name='delete'][arguments.length=1] > ObjectExpression[properties.length=0]",
					"message": "repository.delete({}) will produce a runtime error. Use repository.deleteAll() instead."
				},
				{
					"selector": "CallExpression[callee.property.name='update'][arguments.length>=1] > ObjectExpression[properties.length=0]",
					"message": "repository.update({}, {...}) will produce a runtime error. Use repository.updateAll({...}) instead."
				},
			],
		}
	},
];
