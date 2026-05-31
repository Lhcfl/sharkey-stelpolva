/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { parse, format } from 'node:path';
import { rename } from 'node:fs/promises';

/**
 * Renames a file according to some parameters - like the old "rename" library, but without pulling in an entire package.
 * @param path Path to the file
 * @param renameOpts Rename parameters
 * @returns Path to the moved file
 */
export async function renameFile(path: string, renameOpts: string | RenameOpts): Promise<string> {
	// Derive new path
	const newPath = renamePath(path, renameOpts);

	// Make sure it actually changed
	if (newPath === path) {
		return path;
	}

	// Rename it
	await rename(path, newPath);
	return newPath;
}

/**
 * Rewrites a file path according to some parameters - like renameFile() but without actually touching any files.
 * @param path Path to transform
 * @param transformOpts Transformation parameters
 * @returns Transformed path
 */
export function renamePath(path: string, transformOpts: string | RenameOpts): string {
	// "path" mode
	if (typeof(transformOpts) === 'string') return transformOpts;
	if ('path' in transformOpts) return transformOpts.path;

	const parsed = parse(path);

	// "basename" mode
	if ('basename' in transformOpts) {
		return format({
			dir: transformOpts.dirname ?? parsed.dir,
			base: transformOpts.basename,
		});
	}

	// "filename" mode
	return format({
		dir: transformOpts.dirname ?? parsed.dir,
		name: [
			transformOpts.prefix ?? '',
			transformOpts.filename ?? parsed.name,
			transformOpts.suffix ?? '',
		].join(''),
		ext: transformOpts.extname ?? parsed.ext,
	});
}

export type RenameOpts = {
	/**
	 * String to replace the entire path.
	 */
	path: string;
} | {
	/**
	 * String to replace the dirname (path).
	 */
	dirname?: string;

	/**
	 * String to replace the basename.
	 * The basename is the last section of the path.
	 */
	basename: string;
} | {
	/**
	 * String to replace the dirname (path).
	 */
	dirname?: string;

	/**
	 * String to replace the filename.
	 * The filename is the basename excluding extension.
	 */
	filename?: string;

	/**
	 * String to insert before the filename.
	 */
	prefix?: string;

	/**
	 * String to insert after the filename.
	 */
	suffix?: string;

	/**
	 * String to replace the extension.
	 */
	extname?: string;
};
