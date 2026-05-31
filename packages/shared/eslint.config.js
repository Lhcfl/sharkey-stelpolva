import globals from 'globals';
import pluginMisskey from '@misskey-dev/eslint-plugin';

export default [
	...pluginMisskey.configs['recommended'],
	{
		ignores: [
			'**/.pnpm/',
			'**/node_modules/',
			'**/built/',
			'**/built-test/',
			'**/js-built/',
			'**/temp/',
			'**/coverage/',
			'**/*.min.js',
		],
	},
	{
		files: ['**/*.cjs'],
		languageOptions: {
			sourceType: 'commonjs',
			parserOptions: {
				sourceType: 'commonjs',
			},
		},
	},
	{
		files: ['**/*.js', '**/*.jsx'],
		languageOptions: {
			parserOptions: {
				sourceType: 'module',
			},
		},
	},
	{
		files: ['build.js'],
		languageOptions: {
			globals: globals.node,
		},
	},
	{
		files: ['**/*.js', '**/*.cjs'],
		rules: {
			'@typescript-eslint/no-var-requires': 'off',
		},
	},
	{
		files: ['src/**/*.stories.ts'],
		rules: {
			'no-restricted-globals': 'off',
		}
	},
	{
		rules: {
			'no-restricted-imports': ['error', {
				paths: [{ name: 'punycode' }],
			}],
			// https://typescript-eslint.io/rules/prefer-nullish-coalescing/
			'@typescript-eslint/prefer-nullish-coalescing': ['warn', {
				ignorePrimitives: true,
			}],
			'no-param-reassign': 'off',
		},
	},
];
