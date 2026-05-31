/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MetricsTime } from 'bullmq';
import type { Config } from '@/config.js';
import type { QueueType } from '@/queue/types.js';
import type * as Bull from 'bullmq';

// sync with misskey-js src/entities.ts
export const QUEUE_TYPES = [
	'deliver',
	'inbox',
	'system',
	'daemon',
	'endedPollNotification',
	'db',
	'relationship',
	'objectStorage',
	'userWebhookDeliver',
	'systemWebhookDeliver',
	'scheduleNotePost',
	'backgroundTask',
] as const;

// Keep in sync with all the YML configs!
export const QueueDefaults: Partial<Config> = {
	deliverJobConcurrency: 128,
	deliverJobMaxAttempts: 12,

	inboxJobConcurrency: 16,
	inboxJobMaxAttempts: 8,

	systemJobConcurrency: 2,

	endedPollNotificationJobConcurrency: 4,
	endedPollNotificationJobMaxAttempts: 4,

	relationshipJobConcurrency: 16,
	relationshipJobPerSec: 64,

	objectStorageJobConcurrency: 16,
	objectStorageJobMaxAttempts: 4,

	userWebhookDeliverJobConcurrency: 64,
	userWebhookDeliverJobMaxAttempts: 4,

	systemWebhookDeliverJobConcurrency: 16,
	systemWebhookDeliverJobMaxAttempts: 4,

	backgroundTaskJobConcurrency: 32,
	backgroundTaskJobMaxAttempts: 4,
};

export const DefaultMaxAttempts = 1;
export const DefaultJobPerSec = 0;
export const DefaultJobConcurrency = 1;

export function getQueueOptions<QT extends QueueType>(config: Config, queueName: QT) {
	return {
		connection: {
			...config.redisForJobQueue,
			keyPrefix: undefined,
		},
		prefix: config.redisForJobQueue.prefix ? `${config.redisForJobQueue.prefix}:queue:${queueName}` : `queue:${queueName}`,
	} satisfies Bull.QueueOptions;
}

export function getWorkerOptions<QT extends QueueType>(config: Config, queueName: QT) {
	const jobsPerSec = config[`${queueName}JobPerSec`] ?? QueueDefaults[`${queueName}JobPerSec`] ?? DefaultJobPerSec;
	const concurrency = config[`${queueName}JobConcurrency`] ?? QueueDefaults[`${queueName}JobConcurrency`] ?? DefaultJobConcurrency;

	return {
		...getQueueOptions(config, queueName),
		metrics: {
			maxDataPoints: MetricsTime.ONE_WEEK,
		},
		concurrency,
		limiter: jobsPerSec < 1 ? undefined : {
			max: jobsPerSec,
			duration: 1000,
		},
		removeOnComplete: {
			age: 3600 * 24 * 7, // keep up to 7 days
			count: 1000, // Keep up to 1000 successful results
		},
		removeOnFail: {
			age: 3600 * 24 * 7, // keep up to 7 days
			count: 1000, // Keep up to 1000 failed results
		},
		autorun: false,
	} satisfies Bull.WorkerOptions;
}

export function getJobOptions<QT extends QueueType>(config: Config, queueName: QT) {
	const maxAttempts = config[`${queueName}JobMaxAttempts`] ?? QueueDefaults[`${queueName}JobMaxAttempts`] ?? DefaultMaxAttempts;

	return {
		// https://docs.bullmq.io/guide/retrying-failing-jobs#custom-back-off-strategies
		attempts: maxAttempts,
	} satisfies Bull.JobsOptions;
}
