import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import sharedConfig from '../../shared/eslint.config.js';

export default [
	...sharedConfig,
	{
		ignores: [
			"**/built/",
			'**/node_modules/',
			'*.*',
			"**/jest.setup.*"
		],
	},
	{
		languageOptions: {
			globals: {
				...globals.node,
				...globals.jest,
			},
		},
	},
	{
		files: ['**/*.ts', '**/*.tsx'],
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
