/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';

/**
 * Console implementation where all members are jest mocks.
 */
@Injectable()
export class MockConsole implements Console {
	public readonly Console = MockConsole;

	/**
	 * Resets all mocks in the console.
	 */
	@bindThis
	public mockReset(): void {
		for (const func of Object.values(this)) {
			if (typeof(func) === 'function' && 'mockReset' in func) {
				func.mockReset();
			}
		}
	}

	/**
	 * Asserts that no errors and/or warnings have been logged.
	 */
	@bindThis
	public assertNoErrors(opts?: { orWarnings?: boolean }): void {
		expect(this.error).not.toHaveBeenCalled();

		if (opts?.orWarnings) {
			expect(this.warn).not.toHaveBeenCalled();
		}
	}

	public readonly error = jest.fn<Console['error']>();
	public readonly warn = jest.fn<Console['warn']>();
	public readonly info = jest.fn<Console['info']>();
	public readonly log = jest.fn<Console['log']>();
	public readonly debug = jest.fn<Console['debug']>();
	public readonly trace = jest.fn<Console['trace']>();
	public readonly assert = jest.fn<Console['assert']>();
	public readonly clear = jest.fn<Console['clear']>();
	public readonly count = jest.fn<Console['count']>();
	public readonly countReset = jest.fn<Console['countReset']>();
	public readonly dir = jest.fn<Console['dir']>();
	public readonly dirxml = jest.fn<Console['dirxml']>();
	public readonly group = jest.fn<Console['group']>();
	public readonly groupCollapsed = jest.fn<Console['groupCollapsed']>();
	public readonly groupEnd = jest.fn<Console['groupEnd']>();
	public readonly table = jest.fn<Console['table']>();
	public readonly time = jest.fn<Console['time']>();
	public readonly timeEnd = jest.fn<Console['timeEnd']>();
	public readonly timeLog = jest.fn<Console['timeLog']>();
	public readonly profile = jest.fn<Console['profile']>();
	public readonly profileEnd = jest.fn<Console['profileEnd']>();
	public readonly timeStamp = jest.fn<Console['timeStamp']>();
}
