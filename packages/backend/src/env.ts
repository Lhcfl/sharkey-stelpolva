/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export interface EnvOption {
	onlyQueue: boolean;
	onlyServer: boolean;
	noDaemons: boolean;
	disableClustering: boolean;
	verbose: boolean;
	withLogTime: boolean;
	quiet: boolean;
	hideWorkerId: boolean;
	[key: string]: boolean;
}

const defaultEnvOption: Readonly<EnvOption> = {
	onlyQueue: false,
	onlyServer: false,
	noDaemons: false,
	disableClustering: false,
	verbose: false,
	withLogTime: false,
	quiet: false,
	hideWorkerId: false,
};

function translateKey(key: string): string {
	return 'MK_' + key.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase();
}

const testEnvOption: Readonly<EnvOption> = {
	...defaultEnvOption,
	disableClustering: true,
	quiet: true,
	noDaemons: true,
};

/** @deprecated use EnvService when possible */
export const envOption: EnvOption = createEnvOptions(() => process.env);

export function createEnvOptions(getEnv: () => Partial<Record<string, string>>): EnvOption {
	return new Proxy({} as EnvOption, {
		get(target, key) {
			if (typeof(key) !== 'string') {
				return Reflect.get(target, key);
			}

			const env = getEnv();
			const envKey = translateKey(key);
			if (envKey in env) {
				const envValue = env[envKey]?.toLowerCase();
				return !!envValue && envValue !== '0' && envValue !== 'false';
			}

			const def = env.NODE_ENV === 'test' ? testEnvOption : defaultEnvOption;
			if (key in def) {
				return def[key];
			}

			return false;
		},
		set(target, key, value) {
			if (typeof(key) !== 'string') {
				return Reflect.set(target, key, value);
			}

			const env = getEnv();
			const envKey = translateKey(key);
			if (value) {
				env[envKey] = '1';
			} else {
				delete env[envKey];
			}
			return true;
		},
		has(target, key): boolean {
			return typeof(key) === 'string' || key in target;
		},
		deleteProperty(target, key): boolean {
			if (typeof(key) !== 'string') {
				return Reflect.deleteProperty(target, key);
			}

			const env = getEnv();
			const envKey = translateKey(key);
			delete env[envKey];
			return true;
		},
	});
}
