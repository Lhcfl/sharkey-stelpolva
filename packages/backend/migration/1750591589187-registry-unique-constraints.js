/*
 * SPDX-FileCopyrightText: dakkar and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RegistryUniqueConstraints1750591589187 {
	async up(queryRunner) {
		await queryRunner.query(`DELETE FROM "registry_item" WHERE "id" IN (
SELECT t."id" FROM (
SELECT *, ROW_NUMBER() OVER (PARTITION BY "userId","key","scope","domain" ORDER BY "updatedAt" DESC) rn
FROM "registry_item"
) t WHERE t.rn>1)`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d9c48d580287308f8c1f674946" ON "registry_item" ("userId", "key", "scope", "domain") NULLS NOT DISTINCT`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_d9c48d580287308f8c1f674946"`);
	}
}
