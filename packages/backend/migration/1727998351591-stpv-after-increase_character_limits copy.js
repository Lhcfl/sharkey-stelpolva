/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class StpvAfterIncreaseCharacterLimits1727998351591 {
	name = 'StpvAfterIncreaseCharacterLimits1727998351591'

	async up(queryRunner) {
		await queryRunner.query(`DROP INDEX "IDX_stpv_pgroonga_note_cw"`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_stpv_pgroonga_note_cw" ON "note" USING "pgroonga" ("cw")`,
		);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "IDX_stpv_pgroonga_note_cw"`);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_stpv_pgroonga_note_cw" ON "note" USING "pgroonga" ("cw" pgroonga_varchar_full_text_search_ops_v2)`,
		);
	}
}
