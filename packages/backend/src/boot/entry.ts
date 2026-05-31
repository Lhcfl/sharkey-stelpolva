/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Misskey Entry Point!
 */

import cluster from 'node:cluster';
import chalk from 'chalk';
import { coreLogger, coreEnvService } from '@/boot/coreLogger.js';
import { prepEnv } from '@/boot/prepEnv.js';
import { masterMain } from './master.js';
import { workerMain } from './worker.js';
import { readyRef } from './ready.js';

// TODO make this customizable
process.title = `Misskey (${cluster.isPrimary ? 'master' : 'worker'})`;

prepEnv();

// We wrap this in a main function, that gets called,
// because not all platforms support top level await :/

async function main() {
	const envOption = coreEnvService.options;
	const clusterLogger = coreLogger.createSubLogger('cluster', 'orange');
	const bootLogger = coreLogger.createSubLogger('boot', 'magenta');

	//#region Events
	// Listen new workers
	cluster.on('fork', worker => {
		clusterLogger.debug(`Process forked: [${worker.id}]`);
	});

	// Listen online workers
	cluster.on('online', worker => {
		clusterLogger.debug(`Process is now online: [${worker.id}]`);
	});

	// Listen for dying workers
	cluster.on('exit', worker => {
		// Replace the dead worker,
		// we're not sentimental
		clusterLogger.error(chalk.red(`[${worker.id}] died :(`));
		cluster.fork();
	});

	// Dying away...
	process.on('disconnect', () => {
		coreLogger.warn('IPC channel disconnected! The process may soon die.');
	});
	process.on('beforeExit', code => {
		coreLogger.warn(`Event loop died! Process will exit with code ${code}.`);
	});
	process.on('exit', code => {
		coreLogger.info(`The process is going to exit with code ${code}`);
	});
	//#endregion

	if (!envOption.disableClustering) {
		if (cluster.isPrimary) {
			bootLogger.info(`Start main process... pid: ${process.pid}`);
			await masterMain(bootLogger);
		} else if (cluster.isWorker) {
			bootLogger.info(`Start worker process... pid: ${process.pid}`);
			await workerMain(bootLogger);
		} else {
			throw new Error('Unknown process type');
		}
	} else {
		// 非clusterの場合はMasterのみが起動するため、Workerの処理は行わない(cluster.isWorker === trueの状態でこのブロックに来ることはない)
		bootLogger.info(`Start main process... pid: ${process.pid}`);
		await masterMain(bootLogger);
	}

	readyRef.value = true;

	// ユニットテスト時にMisskeyが子プロセスで起動された時のため
	// それ以外のときは process.send は使えないので弾く
	if (process.send) {
		process.send('ok');
	}
}

main();
