/*
 * SPDX-FileCopyrightText: syuilo and other misskey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { MiNote, MiUser, MiNoteSchedule, NoteScheduleRepository, NotesRepository } from '@/models/_.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { QueryService } from '@/core/QueryService.js';
import { Packed } from '@/misc/json-schema.js';
import { noteVisibilities } from '@/types.js';
import { bindThis } from '@/decorators.js';
import { promiseMap } from '@/misc/promise-map.js';
import { In } from 'typeorm';

export const meta = {
	tags: ['notes'],

	requireCredential: true,
	kind: 'read:notes-schedule',
	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: { type: 'string', format: 'misskey:id', optional: false, nullable: false },
				note: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						createdAt: { type: 'string', optional: false, nullable: false },
						text: { type: 'string', optional: true, nullable: false },
						cw: { type: 'string', optional: true, nullable: true },
						fileIds: { type: 'array', optional: false, nullable: false, items: { type: 'string', format: 'misskey:id', optional: false, nullable: false } },
						visibility: { type: 'string', enum: ['public', 'home', 'followers', 'specified'], optional: false, nullable: false },
						visibleUsers: {
							type: 'array', optional: false, nullable: false, items: {
								type: 'object',
								optional: false, nullable: false,
								ref: 'UserLite',
							},
						},
						user: {
							type: 'object',
							optional: false, nullable: false,
							ref: 'User',
						},
						reactionAcceptance: { type: 'string', nullable: true, enum: [null, 'likeOnly', 'likeOnlyForRemote', 'nonSensitiveOnly', 'nonSensitiveOnlyForLocalLikeOnlyForRemote'], default: null },
						isSchedule: { type: 'boolean', optional: false, nullable: false },
					},
				},
				userId: { type: 'string', optional: false, nullable: false },
				scheduledAt: { type: 'string', optional: false, nullable: false },
			},
		},
	},
	limit: {
		duration: ms('1hour'),
		max: 300,
	},

	errors: {
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.noteScheduleRepository)
		private noteScheduleRepository: NoteScheduleRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private userEntityService: UserEntityService,
		private noteEntityService: NoteEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private queryService: QueryService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.queryService.makePaginationQuery(this.noteScheduleRepository.createQueryBuilder('note'), ps.sinceId, ps.untilId)
				.andWhere('note.userId = :userId', { userId: me.id });
			const scheduleNotes = await query.limit(ps.limit).getMany();
			const refNoteIds = scheduleNotes.flatMap(s => [s.note.reply, s.note.renote]).filter(id => id != null);
			const refNotesList = await this.notesRepository.findBy({ id: In(refNoteIds) });
			const refNotesMap = new Map(refNotesList.map(n => [n.id, n]));
			const user = await this.userEntityService.pack(me, me);
			const scheduleNotesPack: {
				id: string;
				note: {
					text?: string;
					cw?: string | null;
					fileIds: string[];
					visibility: typeof noteVisibilities[number];
					visibleUsers: Packed<'UserLite'>[];
					reactionAcceptance: MiNote['reactionAcceptance'];
					user: Packed<'User'>;
					createdAt: string;
					isSchedule: boolean;
				};
				userId: string;
				scheduledAt: string;
			}[] = await promiseMap(scheduleNotes, async (item: MiNoteSchedule) => {
				const renote = await this.fetchNote(item.note.renote, me, refNotesMap);
				const reply = await this.fetchNote(item.note.reply, me, refNotesMap);

				return {
					...item,
					scheduledAt: item.scheduledAt.toISOString(),
					note: {
						...item.note,
						text: item.note.text ?? '',
						user: user,
						visibility: item.note.visibility ?? 'public',
						reactionAcceptance: item.note.reactionAcceptance ?? null,
						visibleUsers: item.note.visibleUsers ? await this.userEntityService.packMany(item.note.visibleUsers.map(u => u.id), me) : [],
						fileIds: item.note.files ? item.note.files : [],
						files: await this.driveFileEntityService.packManyByIds(item.note.files),
						createdAt: item.scheduledAt.toISOString(),
						isSchedule: true,
						id: item.id,
						renote, reply,
						renoteId: item.note.renote,
						replyId: item.note.reply,
						poll: item.note.poll ? await this.fillPoll(item.note.poll) : undefined,
					},
				};
			}, {
				limit: 4,
			});

			return scheduleNotesPack;
		});
	}

	@bindThis
	private async fetchNote(
		id: MiNote['id'] | null | undefined,
		me: MiUser,
		hint?: Map<string, MiNote>,
	): Promise<Packed<'Note'> | null> {
		if (id) {
			const note = hint?.get(id) ?? await this.notesRepository.findOneBy({ id });
			if (note) {
				note.reactionAndUserPairCache ??= [];
				return await this.noteEntityService.pack(note, me);
			}
		}
		return null;
	}

	// Pulled from NoteEntityService and modified to work with MiNoteSchedule
	// originally planned to use directly from NoteEntityService but since the poll doesn't actually exist yet that doesn't work
	@bindThis
	private async fillPoll(poll: { multiple: boolean; choices: string[]; expiresAt: string | null }) {
		const choices = poll.choices.map(c => ({
			text: c,
			votes: 0, // Default to 0 as there will never be any registered votes while scheduled
			isVoted: false, // Default to false as the author can't vote anyways since the poll does not exist in the repo yet
		}));

		return {
			multiple: poll.multiple,
			expiresAt: poll.expiresAt ? new Date(poll.expiresAt).toISOString() : null,
			choices,
		};
	}
}
