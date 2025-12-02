/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CreateSharedAccessToken1750478202328 {
	name = 'CreateSharedAccessToken1750478202328'

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "shared_access_token" ("accessTokenId" character varying(32) NOT NULL, "granteeId" character varying(32) NOT NULL, CONSTRAINT "PK_b741ebcd3988295f4140a9f31b4" PRIMARY KEY ("accessTokenId")); COMMENT ON COLUMN "shared_access_token"."accessTokenId" IS 'ID of the access token that is shared'; COMMENT ON COLUMN "shared_access_token"."granteeId" IS 'ID of the user who is allowed to use this access token'`);
		await queryRunner.query(`CREATE INDEX "IDX_shared_access_token_granteeId" ON "shared_access_token" ("granteeId") `);
		await queryRunner.query(`ALTER TABLE "shared_access_token" ADD CONSTRAINT "FK_shared_access_token_accessTokenId" FOREIGN KEY ("accessTokenId") REFERENCES "access_token"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "shared_access_token" ADD CONSTRAINT "FK_shared_access_token_granteeId" FOREIGN KEY ("granteeId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "shared_access_token" DROP CONSTRAINT "FK_shared_access_token_granteeId"`);
		await queryRunner.query(`ALTER TABLE "shared_access_token" DROP CONSTRAINT "FK_shared_access_token_accessTokenId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_shared_access_token_granteeId"`);
		await queryRunner.query(`DROP TABLE "shared_access_token"`);
	 }
}
