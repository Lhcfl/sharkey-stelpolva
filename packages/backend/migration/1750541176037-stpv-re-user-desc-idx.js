/*
 * SPDX-FileCopyrightText: Lillychan and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class StpvReUserDescIdx17505411760367 {
	async up(queryRunner) {
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "IDX_stpv_pgroonga_user_profile_desc" ON "user_profile" USING "pgroonga" ("description" pgroonga_varchar_full_text_search_ops_v2)`,
		);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "IDX_stpv_pgroonga_user_profile_desc"`);
	}
}
