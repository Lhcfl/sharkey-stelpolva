/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { build } from './index.js';
import generateDTS from './generateDTS.js';

console.log('Building locales...');
build();
generateDTS();
