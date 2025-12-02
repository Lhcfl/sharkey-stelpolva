/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddUserLastFetchedFeaturedAt1758129782800 {
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user" ADD "lastFetchedFeaturedAt" DATE`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "lastFetchedFeaturedAt"`);
	}
}
