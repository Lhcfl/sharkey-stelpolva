/*
 * SPDX-FileCopyrightText: Lillychan and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class MetaRulesLength1754754816000 {
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "serverRules" TYPE TEXT[]`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "serverRules" TYPE character varying(280)[]`);
	}
}
