/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EnvService } from '@/global/EnvService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { NativeTimeService } from '@/global/TimeService.js';

export const coreEnvService = new EnvService();

// eslint-disable-next-line no-restricted-globals
export const coreLoggerService = new LoggerService(console, new NativeTimeService(), coreEnvService);
export const coreLogger = coreLoggerService.getLogger('core', 'cyan');
