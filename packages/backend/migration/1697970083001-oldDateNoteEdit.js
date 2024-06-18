/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class OldDateNoteEdit1697970083001 {
	name = "OldDateNoteEdit1697970083001";

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note_edit" ADD COLUMN "oldDate" TIMESTAMP WITH TIME ZONE`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note_edit" DROP COLUMN "oldDate"`);
	}
}
