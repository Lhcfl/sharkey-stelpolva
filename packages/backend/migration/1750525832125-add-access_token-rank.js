/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddAccessTokenRank1750525832125 {
	async up(queryRunner) {
		await queryRunner.query(`CREATE TYPE "public"."access_token_rank_enum" AS ENUM('user', 'mod', 'admin')`);
		await queryRunner.query(`ALTER TABLE "access_token" ADD "rank" "public"."access_token_rank_enum"`);
		await queryRunner.query(`COMMENT ON COLUMN "access_token"."rank" IS 'Limits the user'' rank (user, moderator, or admin) when using this token. If null (default), then uses the user''s actual rank.'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`COMMENT ON COLUMN "access_token"."rank" IS 'Limits the user'' rank (user, moderator, or admin) when using this token. If null (default), then uses the user''s actual rank.'`);
		await queryRunner.query(`ALTER TABLE "access_token" DROP COLUMN "rank"`);
		await queryRunner.query(`DROP TYPE "public"."access_token_rank_enum"`);
	}
}
