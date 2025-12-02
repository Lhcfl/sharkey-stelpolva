/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { createEnvOptions, type EnvOption } from '@/env.js';

/**
 * Provides structured, mockable access to runtime/environment details.
 */
@Injectable()
export class EnvService {
	protected readonly envOptions: EnvOption = createEnvOptions(() => this.env);

	/**
	 * Returns the environment variables of the process.
	 * Modifications are reflected back to the local process, but not to the operating system environment.
	 */
	public get env(): Partial<Record<string, string>> {
		return process.env;
	}

	/**
	 * Maps and returns environment-based options for the process.
	 * Modifications are reflected back to the local process ("env" property), but not to the operating system environment.
	 */
	public get options(): EnvOption {
		return this.envOptions;
	}
}
