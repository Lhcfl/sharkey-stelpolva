/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { writeFile } from 'node:fs/promises';
import { locales } from 'locales';

await writeFile(
	new URL('locale.js', import.meta.url),
	`export default ${JSON.stringify(locales['en-US'], undefined, 2)};`,
	'utf8',
);
