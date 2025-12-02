/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Need to reference the built file
import { prepEnv } from '../built/boot/prepEnv.js';

/**
 * Applies the Sharkey environment details into the test environment.
 * https://jestjs.io/docs/configuration#globalsetup-string
 */
export default function setup() {
	// Make sure tests run in the Sharkey environment.
	prepEnv();
}
