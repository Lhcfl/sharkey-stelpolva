/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import cluster from 'node:cluster';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as fs from 'node:fs';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { loadConfig } from '@/config.js';
import { jobQueue, server } from '@/boot/common.js';
import { coreEnvService, coreLogger } from '@/boot/coreLogger.js';
import type { Logger } from '@/logger.js';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);
const meta = JSON.parse(fs.readFileSync(`${_dirname}/../../../../built/meta.json`, 'utf-8'));

/**
 * Init worker process
 */
export async function workerMain(bootLogger?: Logger) {
	bootLogger ??= coreLogger.createSubLogger('boot', 'magenta');

	const config = loadConfig(bootLogger);
	const envOption = coreEnvService.options;

	if (config.sentryForBackend) {
		Sentry.init({
			integrations: [
				...(config.sentryForBackend.enableNodeProfiling ? [nodeProfilingIntegration()] : []),
			],

			// Performance Monitoring
			tracesSampleRate: 1.0, //  Capture 100% of the transactions

			// Set sampling rate for profiling - this is relative to tracesSampleRate
			profilesSampleRate: 1.0,

			maxBreadcrumbs: 0,

			// Set release version
			release: 'Sharkey@' + (meta.gitVersion ?? meta.version),

			...config.sentryForBackend.options,
		});
	}

	if (envOption.onlyServer) {
		await server();
	} else if (envOption.onlyQueue) {
		await jobQueue();
	} else {
		await jobQueue();
	}

	if (cluster.isWorker) {
		// Send a 'ready' message to parent process
		process.send!('ready');
	}
}
