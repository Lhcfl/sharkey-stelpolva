import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import sharedConfig from '../shared/eslint.config.js';

export default [
	...sharedConfig,
	{
		ignores: [
			'**/built/',
			'migration/',
			'**/node_modules/',
			'test/',
			'test-federation/',
			'test-server/',
			'**/temp/',
			'**/@types/',
			'**/coverage/',
			'ormconfig.js',
			'scripts/check_connect.js',
			'scripts/generate_api_json.js',
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
		files: ['src/**/*.ts', 'src/**/*.tsx'],
		ignores: [
			'*.*',
			'src/server/web/**/*.d.ts',
		],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				project: ['./tsconfig.backend.json'],
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
			'no-restricted-globals': [
				'error',
				{
					globals: [
						{
							name: '__dirname',
							message: 'Not in ESModule. Use `import.meta.url` instead.',
						},
						{
							name: '__filename',
							message: 'Not in ESModule. Use `import.meta.url` instead.',
						},
						{
							name: 'setTimeout',
							message: 'Use TimeService.startTimer instead.',
						},
						{
							name: 'setInterval',
							message: 'Use TimeService.startTimer instead.',
						},
						{
							name: 'console',
							message: 'Use a Logger instance instead.',
						},
					],
					checkGlobalObject: true,
				},
			],
			'no-restricted-properties': [
				'error',
				{
					object: 'Date',
					property: 'now',
					message: 'Use TimeService.now instead.',
				},
			],
			'no-restricted-syntax': [
				'error',
				{
					'selector': 'NewExpression[callee.name=\'Date\'][arguments.length=0]',
					'message': 'new Date() is restricted. Use TimeService.date instead.',
				},
				{
					'selector': 'NewExpression[callee.name=\'MemoryKVCache\']',
					'message': 'Cache constructor will produce an unmanaged instance. Use CacheManagementService.createMemoryKVCache() instead.',
				},
				{
					'selector': 'NewExpression[callee.name=\'MemorySingleCache\']',
					'message': 'Cache constructor will produce an unmanaged instance. Use CacheManagementService.createMemorySingleCache() instead.',
				},
				{
					'selector': 'NewExpression[callee.name=\'RedisKVCache\']',
					'message': 'Cache constructor will produce an unmanaged instance. Use CacheManagementService.createRedisKVCache() instead.',
				},
				{
					'selector': 'NewExpression[callee.name=\'RedisSingleCache\']',
					'message': 'Cache constructor will produce an unmanaged instance. Use CacheManagementService.createRedisSingleCache() instead.',
				},
				{
					'selector': 'NewExpression[callee.name=\'QuantumKVCache\']',
					'message': 'Cache constructor will produce an unmanaged instance. Use CacheManagementService.createQuantumKVCache() instead.',
				},
				{
					'selector': 'CallExpression[callee.property.name=\'delete\'][arguments.length=1] > ObjectExpression[properties.length=0]',
					'message': 'repository.delete({}) will produce a runtime error. Use repository.deleteAll() instead.',
				},
				{
					'selector': 'CallExpression[callee.property.name=\'update\'][arguments.length>=1] > ObjectExpression[properties.length=0]',
					'message': 'repository.update({}, {...}) will produce a runtime error. Use repository.updateAll({...}) instead.',
				},
			],
		},
	},
	{
		files: [
			'./assets/**/*.js',
			'./assets/**/*.mjs',
			'./assets/**/*.cjs',
			'./src/server/web/**/*.js',
			'./src/server/web/**/*.mjs',
			'./src/server/web/**/*.cjs',
			'./src/server/web/**/*.d.ts',
		],
		languageOptions: {
			globals: {
				...globals.browser,
				LANGS: true,
				CLIENT_ENTRY: true,
				LANGS_VERSION: true,
			},
			parserOptions: {
				parser: tsParser,
				project: ['./tsconfig.frontend.json'],
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'no-restricted-globals': 'off',
			'no-restricted-properties': 'off',
			'no-restricted-syntax': 'off',
		},
	},
	{
		files: [
			'eslint.*',
			'jest.*',
			'scripts/dev.mjs',
			'scripts/watch.mjs',
		],
		ignores: [
			'ormconfig.js',
			'scripts/check_connect.js',
			'scripts/generate_api_json.js',
		],
		languageOptions: {
			parserOptions: {
				parser: tsParser,
				project: ['./tsconfig.scripts.json'],
				sourceType: 'module',
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'import/no-default-export': 'off',
		},
	},
];
