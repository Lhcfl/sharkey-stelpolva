/*
* For a detailed explanation regarding each configuration property and type check, visit:
* https://jestjs.io/docs/en/configuration.html
*/

import base from './jest.config.common.ts';

export default {
	...base,
	globalSetup: '<rootDir>/test/jest.setup.unit.mjs',
	testMatch: [
		"<rootDir>/test/unit/**/*.ts",
		"<rootDir>/src/**/*.test.ts",
	],
};
