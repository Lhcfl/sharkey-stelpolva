/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ReplaceNoteUserHostIndex1748990452958 {
	name = 'ReplaceNoteUserHostIndex1748990452958'

	async up(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_7125a826ab192eb27e11d358a5"`);
		await queryRunner.query(`
			create index "IDX_note_userHost_id"
			on "note" ("userHost", "id" desc)
			nulls not distinct`);
		await queryRunner.query(`comment on index "IDX_note_userHost_id" is 'User host with ID included'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`drop index if exists "IDX_note_userHost_id"`);
		await queryRunner.query(`CREATE INDEX "IDX_7125a826ab192eb27e11d358a5" ON "note" ("userHost") `);
	}
}
