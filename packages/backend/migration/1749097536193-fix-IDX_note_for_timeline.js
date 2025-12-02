/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class FixIDXNoteForTimeline1749097536193 {
	name = 'FixIDXNoteForTimeline1749097536193';

	async up(queryRunner) {
		await queryRunner.query('drop index "IDX_note_for_timelines"');
		await queryRunner.query(`
			create index "IDX_note_for_timelines"
			on "note" ("id" desc, "channelId", "visibility", "userHost")
			include ("userId", "replyId", "replyUserId", "replyUserHost", "renoteId", "renoteUserId", "renoteUserHost", "threadId")
			NULLS NOT DISTINCT
		`);
		await queryRunner.query(`comment on index "IDX_note_for_timelines" is 'Covering index for timeline queries'`);
	}

	async down(queryRunner) {
		await queryRunner.query('drop index "IDX_note_for_timelines"');
		await queryRunner.query(`
			create index "IDX_note_for_timelines"
			on "note" ("id" desc, "channelId", "visibility", "userHost")
			include ("userId", "userHost", "replyId", "replyUserId", "replyUserHost", "renoteId", "renoteUserId", "renoteUserHost")
			NULLS NOT DISTINCT
		`);
		await queryRunner.query(`comment on index "IDX_note_for_timelines" is 'Covering index for timeline queries'`);
	}
}
