/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class FixUserLastFetchedFeaturedAtType1758136690898 {
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "lastFetchedFeaturedAt" TYPE TIMESTAMP WITH TIME ZONE`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "lastFetchedFeaturedAt" TYPE DATE`);
	}
}
