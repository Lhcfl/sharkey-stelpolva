export class StpvAddPgroonga1727538349223 {
	name = "StpvAddPgroonga1727538349223";

	async up(queryRunner) {
		await queryRunner.query(
			`CREATE INDEX "IDX_stpv_pgroonga_note_text" ON "note" USING "pgroonga" ("text")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_stpv_pgroonga_note_cw" ON "note" USING "pgroonga" ("cw" pgroonga_varchar_full_text_search_ops_v2)`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_stpv_pgroonga_user_profile_desc" ON "user_profile" USING "pgroonga" ("description" pgroonga_varchar_full_text_search_ops_v2)`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_stpv_pgroonga_user_name" ON "user" USING "pgroonga" ("name" pgroonga_varchar_full_text_search_ops_v2)`,
		);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "IDX_stpv_pgroonga_note_text"`);
		await queryRunner.query(`DROP INDEX "IDX_stpv_pgroonga_note_cw"`);
		await queryRunner.query(`DROP INDEX "IDX_stpv_pgroonga_user_name"`);
		await queryRunner.query(`DROP INDEX "IDX_stpv_pgroonga_user_profile_desc"`);
	}
}
