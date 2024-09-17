/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { In } from 'typeorm';
import * as Redis from 'ioredis';
import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository } from '@/models/_.js';
import { obsoleteNotificationTypes, groupedNotificationTypes, FilterUnionByProperty } from '@/types.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteReadService } from '@/core/NoteReadService.js';
import { NotificationEntityService } from '@/core/entities/NotificationEntityService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { MiGroupedNotification, MiNotification } from '@/models/Notification.js';

export const meta = {
	tags: ['account', 'notifications'],

	requireCredential: true,

	limit: {
		duration: 30000,
		max: 30,
	},

	kind: 'read:notifications',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Notification',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		markAsRead: { type: 'boolean', default: true },
		// 後方互換のため、廃止された通知タイプも受け付ける
		includeTypes: { type: 'array', items: {
			type: 'string', enum: [...groupedNotificationTypes, ...obsoleteNotificationTypes],
		} },
		excludeTypes: { type: 'array', items: {
			type: 'string', enum: [...groupedNotificationTypes, ...obsoleteNotificationTypes],
		} },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private idService: IdService,
		private notificationEntityService: NotificationEntityService,
		private notificationService: NotificationService,
		private noteReadService: NoteReadService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const EXTRA_LIMIT = 100;

			// includeTypes が空の場合はクエリしない
			if (ps.includeTypes && ps.includeTypes.length === 0) {
				return [];
			}
			// excludeTypes に全指定されている場合はクエリしない
			if (groupedNotificationTypes.every(type => ps.excludeTypes?.includes(type))) {
				return [];
			}

			const includeTypes = ps.includeTypes && ps.includeTypes.filter(type => !(obsoleteNotificationTypes).includes(type as any)) as typeof groupedNotificationTypes[number][];
			const excludeTypes = ps.excludeTypes && ps.excludeTypes.filter(type => !(obsoleteNotificationTypes).includes(type as any)) as typeof groupedNotificationTypes[number][];

			const limit = (ps.limit + EXTRA_LIMIT) + (ps.untilId ? 1 : 0) + (ps.sinceId ? 1 : 0); // untilIdに指定したものも含まれるため+1
			const notificationsRes = await this.redisClient.xrevrange(
				`notificationTimeline:${me.id}`,
				ps.untilId ? this.idService.parse(ps.untilId).date.getTime() : '+',
				ps.sinceId ? this.idService.parse(ps.sinceId).date.getTime() : '-',
				'COUNT', limit);

			if (notificationsRes.length === 0) {
				return [];
			}

			let notifications = notificationsRes.map(x => JSON.parse(x[1][1])).filter(x => x.id !== ps.untilId && x !== ps.sinceId) as MiNotification[];

			if (includeTypes && includeTypes.length > 0) {
				notifications = notifications.filter(notification => includeTypes.includes(notification.type));
			} else if (excludeTypes && excludeTypes.length > 0) {
				notifications = notifications.filter(notification => !excludeTypes.includes(notification.type));
			}

			if (notifications.length === 0) {
				return [];
			}

			// Mark all as read
			if (ps.markAsRead) {
				this.notificationService.readAllNotification(me.id);
			}

			// grouping
			const notificationGrouper = (
				ns: MiNotification[],
				grouppingKey: (n: MiNotification) => string,
				grouper: (id: string, ns: MiNotification[]) => MiGroupedNotification,
			) => {
				const nMap = new Map<string, MiNotification[]>();
				for (const n of ns) {
					const key = grouppingKey(n);
					let arr = nMap.get(key);
					if (arr == null) {
						arr = [];
						nMap.set(key, arr);
					}
					arr.push(n);
				}
				return Array.from(nMap.entries()).map(([id, ns]) => grouper(id, ns));
			};

			const groupedNotifications = notificationGrouper(
				notifications,
				(n) => {
					if (n.type === 'reaction') {
						return `reaction:${n.noteId}`;
					}
					if (n.type === 'renote') {
						return `renote:${n.targetNoteId}`;
					}
					return `normal:${n.id}`;
				},
				(key, ns) => {
					const [type, id] = key.split(':');
					if (type === 'normal') {
						return ns[0];
					} else if (type === 'reaction') {
						return {
							type: 'reaction:grouped',
							id: ns[ns.length - 1].id,
							createdAt: ns[ns.length - 1].createdAt,
							noteId: id,
							reactions: (ns as FilterUnionByProperty<MiNotification, 'type', 'reaction'>[]).map(n => ({
								userId: n.notifierId,
								reaction: n.reaction,
							})),
						};
					} else if (type === 'renote') {
						return {
							type: 'renote:grouped',
							id: ns[ns.length - 1].id,
							createdAt: ns[ns.length - 1].createdAt,
							noteId: id,
							userIds: (ns as FilterUnionByProperty<MiNotification, 'type', 'renote'>[]).map(n => n.notifierId),
						};
					} else {
						throw new Error('Never');
					}
				},
			).slice(0, ps.limit);

			// let groupedNotifications = [notifications[0]] as MiGroupedNotification[];
			// for (let i = 1; i < notifications.length; i++) {
			// 	const notification = notifications[i];
			// 	const prev = notifications[i - 1];
			// 	let prevGroupedNotification = groupedNotifications.at(-1)!;

			// 	if (prev.type === 'reaction' && notification.type === 'reaction' && prev.noteId === notification.noteId) {
			// 		if (prevGroupedNotification.type !== 'reaction:grouped') {
			// 			groupedNotifications[groupedNotifications.length - 1] = {
			// 				type: 'reaction:grouped',
			// 				id: '',
			// 				createdAt: prev.createdAt,
			// 				noteId: prev.noteId!,
			// 				reactions: [{
			// 					userId: prev.notifierId!,
			// 					reaction: prev.reaction!,
			// 				}],
			// 			};
			// 			prevGroupedNotification = groupedNotifications.at(-1)!;
			// 		}
			// 		(prevGroupedNotification as FilterUnionByProperty<MiGroupedNotification, 'type', 'reaction:grouped'>).reactions.push({
			// 			userId: notification.notifierId!,
			// 			reaction: notification.reaction!,
			// 		});
			// 		prevGroupedNotification.id = notification.id;
			// 		continue;
			// 	}
			// 	if (prev.type === 'renote' && notification.type === 'renote' && prev.targetNoteId === notification.targetNoteId) {
			// 		if (prevGroupedNotification.type !== 'renote:grouped') {
			// 			groupedNotifications[groupedNotifications.length - 1] = {
			// 				type: 'renote:grouped',
			// 				id: '',
			// 				createdAt: notification.createdAt,
			// 				noteId: prev.noteId!,
			// 				userIds: [prev.notifierId!],
			// 			};
			// 			prevGroupedNotification = groupedNotifications.at(-1)!;
			// 		}
			// 		(prevGroupedNotification as FilterUnionByProperty<MiGroupedNotification, 'type', 'renote:grouped'>).userIds.push(notification.notifierId!);
			// 		prevGroupedNotification.id = notification.id;
			// 		continue;
			// 	}

			// 	groupedNotifications.push(notification);
			// }

			// groupedNotifications = groupedNotifications.slice(0, ps.limit);

			const noteIds = groupedNotifications
				.filter((notification): notification is FilterUnionByProperty<MiNotification, 'type', 'mention' | 'reply' | 'quote' | 'edited'> => ['mention', 'reply', 'quote', 'edited'].includes(notification.type))
				.map(notification => notification.noteId!);

			if (noteIds.length > 0) {
				const notes = await this.notesRepository.findBy({ id: In(noteIds) });
				this.noteReadService.read(me.id, notes);
			}

			return await this.notificationEntityService.packGroupedMany(groupedNotifications, me.id);
		});
	}
}
