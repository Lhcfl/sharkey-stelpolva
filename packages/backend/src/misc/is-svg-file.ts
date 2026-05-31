/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createReadStream } from 'node:fs';
import { WritableStream } from 'htmlparser2/WritableStream';

// https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/Namespaces_crash_course
const XmlNamespace = 'http://www.w3.org/2000/svg';

/**
 * Efficiently checks if the file referenced by "path" represents an SVG image.
 * Based on https://github.com/Borewit/file-type-xml/blob/master/lib/index.ts, but greatly simplified.
 */
export async function isSvgFile(path: string): Promise<boolean> {
	const fileStream = createReadStream(path);
	try {
		return await new Promise<boolean>((resolve, reject) => {
			const parserStream = new WritableStream({
				// SVG definition must be in the first tag, so we can skip any counters and just check on the first callback.
				// The only exception would be processing instructions (like DOCTYPE), but they have a separate callback so we're fine.
				// To avoid the overhead of
				onopentag(name, attribs) {
					// <svg> root tag is SVG
					if (name.toLowerCase() === 'svg') {
						resolve(true);
					}

					// <any-tag xmlns="http://www.w3.org/2000/svg"> is also SVG
					if (attribs['xmlns'] === XmlNamespace) {
						return resolve(true);
					}

					// Any other starting tag is not SVG.
					return resolve(false);
				},
				onend() {
					// Blank file is not SVG.
					resolve(false);
				},
				onerror() {
					// Non-XML file is not SVG.
					resolve(false);
				},
				onreset() {
					const err = new Error('Cannot re-use the parser instance!');
					reject(err);
					throw err;
				},
			}, {
				xmlMode: true,
			});

			// Errors from the underlying file stream should be propagated.
			fileStream.once('error', error => reject(error));

			// Errors from the parser stream should be handled, as that's expected for empty, corrupt, and non-XML files.
			parserStream.once('error', () => resolve(false));
			parserStream.once('close', () => resolve(false));

			// Start piping data.
			// https://github.com/fb55/htmlparser2#usage-with-streams
			fileStream.pipe(parserStream);
		});
	} finally {
		// If stream was successfully read as XML, then this is a still-open stream that needs to be closed.
		// If stream could not be read or errored out, then this is a safe no-op.
		fileStream.destroy();
	}
}
