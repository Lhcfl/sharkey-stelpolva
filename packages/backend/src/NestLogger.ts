/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { LoggerService } from '@nestjs/common';
import { coreLogger, coreEnvService } from '@/boot/coreLogger.js';

// TODO make this a mutable instance variable inside NestLogger, then "mount" it from common.ts.
const nestLogger = coreLogger.createSubLogger('nest', 'green');

export class NestLogger implements LoggerService {
	/**
   * Write a 'log' level log.
   */
	log(message: any, ...optionalParams: any[]) {
		const ctx = optionalParams[0];
		nestLogger.info(ctx + ': ' + message);
	}

	/**
   * Write an 'error' level log.
   */
	error(message: any, ...optionalParams: any[]) {
		const ctx = optionalParams[0];
		nestLogger.error(ctx + ': ' + message);
	}

	/**
   * Write a 'warn' level log.
   */
	warn(message: any, ...optionalParams: any[]) {
		const ctx = optionalParams[0];
		nestLogger.warn(ctx + ': ' + message);
	}

	/**
   * Write a 'debug' level log.
   */
	debug?(message: any, ...optionalParams: any[]) {
		if (coreEnvService.env.NODE_ENV === 'production' && !coreEnvService.options.verbose) return;
		const ctx = optionalParams[0];
		nestLogger.debug(ctx + ': ' + message);
	}

	/**
   * Write a 'verbose' level log.
   */
	verbose?(message: any, ...optionalParams: any[]) {
		if (coreEnvService.env.NODE_ENV === 'production' && !coreEnvService.options.verbose) return;
		const ctx = optionalParams[0];
		nestLogger.debug(ctx + ': ' + message);
	}
}
