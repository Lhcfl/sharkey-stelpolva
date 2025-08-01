/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CreateIDXNoteUrl1749229288946 {
	name = 'CreateIDXNoteUrl1749229288946'

	async up(queryRunner) {
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_note_url" ON "note" ("url") `);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_note_url"`);
	}
}
