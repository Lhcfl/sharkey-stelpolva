/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from '@/os';
import { i18n } from '@/i18n';

export type Mutes = (string | string[])[];

export function parseMutes(mutes: string): Mutes {
	// split into lines, remove empty lines and unnecessary whitespace
	const lines = mutes.trim().split('\n').map(line => line.trim()).filter(line => line !== '');
	const outLines: Mutes = Array.from(lines);

	// check each line if it is a RegExp or not
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const regexp = line.match(/^\/(.+)\/(.*)$/);
		if (regexp) {
			// check that the RegExp is valid
			try {
				new RegExp(regexp[1], regexp[2]);
				// note that regex lines will not be split by spaces!
			} catch (err: any) {
				// invalid syntax: do not save, do not reset changed flag
				os.alert({
					type: 'error',
					title: i18n.ts.regexpError,
					text: i18n.tsx.regexpErrorDescription({ tab: 'word mute', line: i + 1 }) + '\n' + err.toString(),
				});
				// re-throw error so these invalid settings are not saved
				throw err;
			}
		} else {
			outLines[i] = line.split(' ');
		}
	}

	return outLines;
}
