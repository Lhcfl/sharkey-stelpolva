/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ReplaceInstanceIsNSFW1751236746539 {
	name = 'ReplaceInstanceIsNSFW1751236746539'

	async up(queryRunner) {
		// Data migration
		await queryRunner.query(`UPDATE "instance" SET "mandatoryCW" = 'NSFW' WHERE "isNSFW" = true`);
		await queryRunner.query(`UPDATE "note" SET "cw" = null WHERE "cw" = 'Instance is marked as NSFW'`);

		// Schema migration
		await queryRunner.query(`ALTER TABLE "instance" DROP COLUMN "isNSFW"`);
	}

	async down(queryRunner) {
		// Schema migration
		await queryRunner.query(`ALTER TABLE "instance" ADD "isNSFW" boolean NOT NULL DEFAULT false`);

		// Data migration
		await queryRunner.query(`UPDATE "instance" SET "isNSFW" = true WHERE "mandatoryCW" ILIKE '%NSFW%'`);
	}
}
