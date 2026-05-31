/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { QUEUE_TYPES } from '@/queue/const.js';
import type { QueueType } from '@/queue/types.js';

export const packedQueueCountSchema = {
	type: 'object',
	properties: {
		waiting: {
			type: 'number',
			optional: false, nullable: false,
		},
		active: {
			type: 'number',
			optional: false, nullable: false,
		},
		completed: {
			type: 'number',
			optional: false, nullable: false,
		},
		failed: {
			type: 'number',
			optional: false, nullable: false,
		},
		delayed: {
			type: 'number',
			optional: false, nullable: false,
		},
		activeSincePrevTick: {
			type: 'number',
			optional: true, nullable: false,
		},
	},
} as const;

export const packedQueueCountsSchema = {
	type: 'object',
	properties: QUEUE_TYPES.reduce((props, qt) => {
		props[qt] = {
			type: 'object',
			optional: false, nullable: false,
			ref: 'QueueCount',
		};
		return props;
	}, {} as Record<QueueType, {
		type: 'object',
		optional: false, nullable: false,
		ref: 'QueueCount',
	}>),
} as const;

export const packedQueueLogSchema = {
	type: 'object',
	allOf: [
		{
			type: 'object',
			ref: 'QueueCount',
		},
		{
			type: 'object',
			properties: {
				activeSincePrevTick: {
					type: 'number',
					optional: false, nullable: false,
				},
			},
		},
	],
} as const;

export const packedQueueLogsSchema = {
	type: 'object',
	properties: QUEUE_TYPES.reduce((props, qt) => {
		props[qt] = {
			type: 'object',
			optional: false, nullable: false,
			ref: 'QueueLog',
		};
		return props;
	}, {} as Record<QueueType, {
		type: 'object',
		optional: false, nullable: false,
		ref: 'QueueLog',
	}>),
} as const;

export const packedQueueStatSchema = {
	type: 'object',
	properties: {
		name: {
			type: 'string',
			enum: QUEUE_TYPES,
			optional: false, nullable: false,
		},
		qualifiedName: {
			type: 'string',
			optional: false, nullable: false,
		},
		counts: {
			type: 'object',
			optional: false, nullable: false,
			additionalProperties: {
				optional: false, nullable: false,
				type: 'number',
			},
		},
		isPaused: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		metrics: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				completed: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						meta: {
							type: 'object',
							optional: false, nullable: false,
							properties: {
								count: {
									type: 'number',
									optional: false, nullable: false,
								},
								prevTS: {
									type: 'number',
									optional: false, nullable: false,
								},
								prevCount: {
									type: 'number',
									optional: false, nullable: false,
								},
							},
						},
						data: {
							type: 'array',
							optional: false, nullable: false,
							items: {
								type: 'number',
								optional: false, nullable: false,
							},
						},
						count: {
							type: 'number',
							optional: false, nullable: false,
						},
					},
				},
				failed: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						meta: {
							type: 'object',
							optional: false, nullable: false,
							properties: {
								count: {
									type: 'number',
									optional: false, nullable: false,
								},
								prevTS: {
									type: 'number',
									optional: false, nullable: false,
								},
								prevCount: {
									type: 'number',
									optional: false, nullable: false,
								},
							},
						},
						data: {
							type: 'array',
							optional: false, nullable: false,
							items: {
								type: 'number',
								optional: false, nullable: false,
							},
						},
						count: {
							type: 'number',
							optional: false, nullable: false,
						},
					},
				},
			},
		},
		db: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				version: {
					type: 'string',
					optional: false, nullable: false,
				},
				mode: {
					type: 'string',
					enum: ['standalone', 'sentinel', 'cluster'] as const,
					optional: false, nullable: false,
				},
				runId: {
					type: 'string',
					optional: false, nullable: false,
				},
				processId: {
					type: 'string',
					optional: false, nullable: false,
				},
				port: {
					type: 'number',
					optional: false, nullable: false,
				},
				os: {
					type: 'string',
					optional: false, nullable: false,
				},
				uptime: {
					type: 'number',
					optional: false, nullable: false,
				},
				memory: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						total: {
							type: 'number',
							optional: false, nullable: false,
						},
						used: {
							type: 'number',
							optional: false, nullable: false,
						},
						fragmentationRatio: {
							type: 'number',
							optional: false, nullable: false,
						},
						peak: {
							type: 'number',
							optional: false, nullable: false,
						},
					},
				},
				clients: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						connected: {
							type: 'number',
							optional: false, nullable: false,
						},
						blocked: {
							type: 'number',
							optional: false, nullable: false,
						},
					},
				},
			},
		},
	},
} as const;

export const packedQueueStatsSchema = {
	type: 'object',
	properties: QUEUE_TYPES.reduce((props, qt) => {
		props[qt] = {
			type: 'object',
			optional: false, nullable: false,
			ref: 'QueueStat',
		};
		return props;
	}, {} as Record<QueueType, {
		type: 'object',
		optional: false, nullable: false,
		ref: 'QueueStat',
	}>),
} as const;

