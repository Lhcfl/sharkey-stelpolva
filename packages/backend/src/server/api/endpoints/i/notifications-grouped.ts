/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { In } from 'typeorm';
import * as Redis from 'ioredis';
import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository } from '@/models/_.js';
import {
	obsoleteNotificationTypes,
	groupedNotificationTypes,
	FilterUnionByProperty,
	notificationTypes,
} from '@/types.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
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
			type: 'string', enum: [...notificationTypes, ...obsoleteNotificationTypes],
		} },
		excludeTypes: { type: 'array', items: {
			type: 'string', enum: [...notificationTypes, ...obsoleteNotificationTypes],
		} },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private idService: IdService,
		private notificationEntityService: NotificationEntityService,
		private notificationService: NotificationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const EXTRA_LIMIT = 100;

			// includeTypes が空の場合はクエリしない
			if (ps.includeTypes && ps.includeTypes.length === 0) {
				return [];
			}
			// excludeTypes に全指定されている場合はクエリしない
			if (notificationTypes.every(type => ps.excludeTypes?.includes(type))) {
				return [];
			}

			const includeTypes = ps.includeTypes && ps.includeTypes.filter(type => !(obsoleteNotificationTypes).includes(type as any)) as typeof groupedNotificationTypes[number][];
			const excludeTypes = ps.excludeTypes && ps.excludeTypes.filter(type => !(obsoleteNotificationTypes).includes(type as any)) as typeof groupedNotificationTypes[number][];

			const notifications = await this.notificationService.getNotifications(me.id, {
				sinceId: ps.sinceId,
				untilId: ps.untilId,
				limit: ps.limit,
				includeTypes,
				excludeTypes,
			});

			if (notifications.length === 0) {
				return [];
			}

			// Mark all as read
			if (ps.markAsRead) {
				this.notificationService.readAllNotification(me.id);
			}

			// grouping
			const groupedNotifications : MiGroupedNotification[] = [];
			// keep track of where reaction / renote notifications are, by note id
			const reactionIdxByNoteId = new Map<string, number>();
			const renoteIdxByNoteId = new Map<string, number>();

			// group notifications by type+note; notice that we don't try to
			// split groups if they span a long stretch of time, because
			// it's probably overkill: if the user has very few
			// notifications, there should be very little difference; if the
			// user has many notifications, the pagination will break the
			// groups

			// scan `notifications` newest-to-oldest (unless we have sinceId && !untilId, in which case it's oldest-to-newest)
			for (let i = 0; i < notifications.length; i++) {
				const notification = notifications[i];

				if (notification.type === 'reaction') {
					const reactionIdx = reactionIdxByNoteId.get(notification.noteId);
					if (reactionIdx === undefined) {
						// first reaction to this note that we see, add it as-is
						// and remember where we put it
						groupedNotifications.push(notification);
						reactionIdxByNoteId.set(notification.noteId, groupedNotifications.length - 1);
						continue;
					}

					let prevReaction = groupedNotifications[reactionIdx] as FilterUnionByProperty<MiGroupedNotification, 'type', 'reaction:grouped'> | FilterUnionByProperty<MiGroupedNotification, 'type', 'reaction'>;
					// if the previous reaction is not a group, make it into one
					if (prevReaction.type !== 'reaction:grouped') {
						prevReaction = groupedNotifications[reactionIdx] = {
							type: 'reaction:grouped',
							id: '',
							createdAt: prevReaction.createdAt,
							noteId: prevReaction.noteId!,
							reactions: [{
								userId: prevReaction.notifierId!,
								reaction: prevReaction.reaction!,
							}],
						};
					}
					// add this new reaction to the existing group
					(prevReaction as FilterUnionByProperty<MiGroupedNotification, 'type', 'reaction:grouped'>).reactions.push({
						userId: notification.notifierId!,
						reaction: notification.reaction!,
					});
					prevReaction.id = notification.id; // this will be the *oldest* id in this group (newest if sinceId && !untilId)
					continue;
				}

				if (notification.type === 'renote') {
					const renoteIdx = renoteIdxByNoteId.get(notification.targetNoteId);
					if (renoteIdx === undefined) {
						// first renote of this note that we see, add it as-is and
						// remember where we put it
						groupedNotifications.push(notification);
						renoteIdxByNoteId.set(notification.targetNoteId, groupedNotifications.length - 1);
						continue;
					}

					let prevRenote = groupedNotifications[renoteIdx] as FilterUnionByProperty<MiGroupedNotification, 'type', 'renote:grouped'> | FilterUnionByProperty<MiGroupedNotification, 'type', 'renote'>;
					// if the previous renote is not a group, make it into one
					if (prevRenote.type !== 'renote:grouped') {
						prevRenote = groupedNotifications[renoteIdx] = {
							type: 'renote:grouped',
							id: '',
							createdAt: prevRenote.createdAt,
							noteId: prevRenote.noteId!,
							userIds: [prevRenote.notifierId!],
						};
					}
					// add this new renote to the existing group
					(prevRenote as FilterUnionByProperty<MiGroupedNotification, 'type', 'renote:grouped'>).userIds.push(notification.notifierId!);
					prevRenote.id = notification.id; // this will be the *oldest* id in this group (newest if sinceId && !untilId)
					continue;
				}

				// not a groupable notification, just push it
				groupedNotifications.push(notification);
			}

			// sort the groups by their id
			groupedNotifications.sort(
				(a, b) => a.id < b.id ? 1 : a.id > b.id ? -1 : 0,
			);
			// this matches the logic in NotificationService and it's what MkPagination expects
			if (ps.sinceId && !ps.untilId) groupedNotifications.reverse();

			return await this.notificationEntityService.packGroupedMany(groupedNotifications, me.id);
		});
	}
}
