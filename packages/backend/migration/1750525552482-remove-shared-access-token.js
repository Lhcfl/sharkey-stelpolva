/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RemoveSharedAccessToken1750525552482 {
	name = 'RemoveSharedAccessToken1750525552482'

	async up(queryRunner) {
		// Drop old table
		await queryRunner.query(`ALTER TABLE "shared_access_token" DROP CONSTRAINT "FK_shared_access_token_granteeId"`);
		await queryRunner.query(`ALTER TABLE "shared_access_token" DROP CONSTRAINT "FK_shared_access_token_accessTokenId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_shared_access_token_granteeId"`);
		await queryRunner.query(`DROP TABLE "shared_access_token"`);

		// Create new column
		await queryRunner.query(`ALTER TABLE "access_token" ADD "granteeIds" character varying(32) array NOT NULL DEFAULT '{}'`);
		await queryRunner.query(`COMMENT ON COLUMN "access_token"."granteeIds" IS 'IDs of other users who are permitted to access and use this token.'`);

		// Create custom index
		await queryRunner.query(`CREATE INDEX "IDX_access_token_granteeIds" ON "access_token" USING GIN ("granteeIds" array_ops)`)
	}

	async down(queryRunner) {
		// Drop custom index
		await queryRunner.query(`DROP INDEX "IDX_access_token_granteeIds"`);

		// Drop new column
		await queryRunner.query(`ALTER TABLE "access_token" DROP COLUMN "granteeIds"`);

		// Create old table
		await queryRunner.query(`CREATE TABLE "shared_access_token" ("accessTokenId" character varying(32) NOT NULL, "granteeId" character varying(32) NOT NULL, CONSTRAINT "PK_b741ebcd3988295f4140a9f31b4" PRIMARY KEY ("accessTokenId")); COMMENT ON COLUMN "shared_access_token"."accessTokenId" IS 'ID of the access token that is shared'; COMMENT ON COLUMN "shared_access_token"."granteeId" IS 'ID of the user who is allowed to use this access token'`);
		await queryRunner.query(`CREATE INDEX "IDX_shared_access_token_granteeId" ON "shared_access_token" ("granteeId") `);
		await queryRunner.query(`ALTER TABLE "shared_access_token" ADD CONSTRAINT "FK_shared_access_token_accessTokenId" FOREIGN KEY ("accessTokenId") REFERENCES "access_token"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "shared_access_token" ADD CONSTRAINT "FK_shared_access_token_granteeId" FOREIGN KEY ("granteeId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}
}
