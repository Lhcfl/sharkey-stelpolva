/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import process from 'node:process';
import { Injectable } from '@nestjs/common';
import { EnvService } from '@/global/EnvService.js';
import { bindThis } from '@/decorators.js';

/**
 * Implementation of EnvService with support for mocking values.
 * Environment and package versions are loaded from their original sources, but can be overridden as-needed.
 */
@Injectable()
export class MockEnvService extends EnvService {
	public readonly _env: typeof process['env'];

	private overrides: Partial<Record<string, string | null>> = {};

	constructor() {
		super();
		this._env = new Proxy(process.env, {
			get: (env, key) => {
				if (key in this.overrides && this.overrides[key as string] !== undefined) {
					return this.overrides[key as string] ?? undefined;
				} else {
					return env[key as string];
				}
			},
			has: (env, key) => {
				if (key in this.overrides && this.overrides[key as string] !== undefined) {
					return this.overrides[key as string] != null;
				} else {
					return key in env;
				}
			},
			set: (_, key, value) => {
				this.overrides[key as string] = value;
				return true;
			},
			deleteProperty: (_, key) => {
				this.overrides[key as string] = null;
				return true;
			},
			ownKeys: (env) => {
				const envKeys = Reflect.ownKeys(env);
				const allKeys = new Set(envKeys);

				const overrides = Object.entries(this.overrides);
				for (const [key, value] of overrides) {
					if (value !== undefined) {
						if (value === null) {
							allKeys.delete(key);
						} else {
							allKeys.add(key);
						}
					}
				}

				return Array.from(allKeys);
			},
		});
	}

	/**
	 * Gets the mocked environment.
	 * The returned object is "live" and can be modified without polluting the actual application environment.
	 */
	get env(): Partial<Record<string, string>> {
		return this._env;
	}

	/**
	 * Returns a variable from the mocked environment.
	 */
	public get(key: string): string | undefined {
		return this.env[key];
	}

	/**
	 * Sets a variable in the mocked environment.
	 */
	public set(key: string, value: string): void {
		this.overrides[key] = value;
	}

	/**
	 * Removes a variable from the mocked environment.
	 */
	public delete(key: string): void {
		this.overrides[key] = null;
	}

	/**
	 * Resets the mock to initial values.
	 */
	@bindThis
	public mockReset(): void {
		this.overrides = {};
	}
}
