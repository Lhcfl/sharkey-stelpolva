/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as nodepath from 'path';

const dirname = import.meta.dirname;

/** Root directory of the misskey-js project */
export const rootDir = nodepath.join(dirname, '../');
/** Output directory for fully-built library. */
export const outDir = nodepath.join(rootDir, 'built');
/** Working directory for builds. */
export const buildDir = nodepath.join(rootDir, 'temp/built');

/** Source directory for "scripts" subpackage, containing pure-JS scripts. */
export const scriptsSource = dirname;
/** Source directory for "lib" subpackage, containing the actual library source. */
export const libSource = nodepath.join(rootDir, 'src');
/** Source directory for "test" subpackage, containing unit tests. */
export const testSource = nodepath.join(rootDir, 'test');
/** Source directory for "test-d" subpackage, containing non-built type tests. */
export const testDSource = nodepath.join(rootDir, 'test-d');

/** Working directory for "lib" subpackage builds */
export const libBuild = nodepath.join(buildDir, 'src');
/** Working directory for "test" subpackage builds */
export const testBuild = nodepath.join(buildDir, 'test');
/** Working directory for "test-d" subpackage builds */
export const testDBuild = nodepath.join(buildDir, 'test-d');
