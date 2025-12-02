/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { rm, cp, mkdir } from 'fs/promises';
import { libBuild, outDir, testDBuild, testDSource } from './_common.mjs';

// Always clean the output, because artifacts are cached in the build directory instead.
console.log(`Cleaning output directory ${outDir}...`);
await rm(outDir, { recursive: true, force: true });

// Copy built lib to output directory.
await mkdir(outDir, { recursive: true });
await cp(libBuild, outDir, { recursive: true });

// Stage test-d sources in the build directory so tsd will work.
await mkdir(testDBuild, { recursive: true });
await cp(testDSource, testDBuild, { recursive: true });
