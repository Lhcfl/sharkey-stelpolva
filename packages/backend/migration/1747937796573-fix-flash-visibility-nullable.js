/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class FixFlashVisibilityNullable1747937796573 {
	name = 'FixFlashVisibilityNullable1747937796573'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "flash" ALTER COLUMN "visibility" SET NOT NULL`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "flash" ALTER COLUMN "visibility" DROP NOT NULL`);
		}
}
