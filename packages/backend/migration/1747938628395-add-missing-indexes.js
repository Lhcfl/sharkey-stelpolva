/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddMissingIndexes1747938628395 {
	name = 'AddMissingIndexes1747938628395'

	async up(queryRunner) {
		// Some instances have duplicate list entries
		await queryRunner.query(`
			DELETE FROM "user_list_membership"
			WHERE "id" NOT IN (
					SELECT MIN("id")
					FROM "user_list_membership"
					GROUP BY "userId", "userListId"
			)`);

		// Some instances already have these indexes, for an unknown reason
		await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_e4f3094c43f2d665e6030b0337"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_cddcaf418dc4d392ecfcca842a"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_021015e6683570ae9f6b0c62be"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_58699f75b9cf904f5f007909cb"`);

		// Now the actual migration
		await queryRunner.query(`CREATE INDEX "IDX_58699f75b9cf904f5f007909cb" ON "user_profile" ("birthday") `);
		await queryRunner.query(`CREATE INDEX "IDX_021015e6683570ae9f6b0c62be" ON "user_list_membership" ("userId") `);
		await queryRunner.query(`CREATE INDEX "IDX_cddcaf418dc4d392ecfcca842a" ON "user_list_membership" ("userListId") `);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e4f3094c43f2d665e6030b0337" ON "user_list_membership" ("userId", "userListId") `);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_e4f3094c43f2d665e6030b0337"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_cddcaf418dc4d392ecfcca842a"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_021015e6683570ae9f6b0c62be"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_58699f75b9cf904f5f007909cb"`);
	}
}
