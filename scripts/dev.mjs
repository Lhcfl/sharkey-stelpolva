/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

// Quick clean of build artifacts only
await execa('pnpm', ['clean'], {
	cwd: _dirname + '/../',
	stdout: process.stdout,
	stderr: process.stderr,
});

// Pre-build the whole solution to avoid rounds of errors during startup
await execa('pnpm', ['build'], {
	cwd: _dirname + '/../',
	stdout: process.stdout,
	stderr: process.stderr,
});

// Watch for changes
await Promise.all([
	execa('pnpm', ['build-pre', '--watch', '--fast'], {
		cwd: _dirname + '/../',
		stdout: process.stdout,
		stderr: process.stderr,
	}),

	execa('pnpm', ['build-assets', '--watch', '--fast'], {
		cwd: _dirname + '/../',
		stdout: process.stdout,
		stderr: process.stderr,
	}),

	execa('pnpm', ['--filter', 'backend', 'dev:fast'], {
		cwd: _dirname + '/../',
		stdout: process.stdout,
		stderr: process.stderr,
	}),

	execa('pnpm', ['--filter', 'frontend-shared', 'watch:fast'], {
		cwd: _dirname + '/../',
		stdout: process.stdout,
		stderr: process.stderr,
	}),

	execa('pnpm', ['--filter', 'frontend', 'watch:fast'], {
		cwd: _dirname + '/../',
		stdout: process.stdout,
		stderr: process.stderr,
	}),

	execa('pnpm', ['--filter', 'frontend-embed', 'watch:fast'], {
		cwd: _dirname + '/../',
		stdout: process.stdout,
		stderr: process.stderr,
	}),

	execa('pnpm', ['--filter', 'sw', 'watch:fast'], {
		cwd: _dirname + '/../',
		stdout: process.stdout,
		stderr: process.stderr,
	}),

	execa('pnpm', ['--filter', 'misskey-reversi', 'watch:fast'], {
		cwd: _dirname + '/../',
		stdout: process.stdout,
		stderr: process.stderr,
	}),

	execa('pnpm', ['--filter', 'misskey-bubble-game', 'watch:fast'], {
		cwd: _dirname + '/../',
		stdout: process.stdout,
		stderr: process.stderr,
	}),
]);
