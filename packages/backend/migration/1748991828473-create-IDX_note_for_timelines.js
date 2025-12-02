/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CreateIDXNoteForTimelines1748991828473 {
	name = 'CreateIDXNoteForTimelines1748991828473';

	async up(queryRunner) {
		await queryRunner.query(`
			create index "IDX_note_for_timelines"
			on "note" ("id" desc, "channelId", "visibility", "userHost")
			include ("userId", "userHost", "replyId", "replyUserId", "replyUserHost", "renoteId", "renoteUserId", "renoteUserHost")
			NULLS NOT DISTINCT`);
		await queryRunner.query(`comment on index "IDX_note_for_timelines" is 'Covering index for timeline queries'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "IDX_note_for_timelines"`);
	}
}
