/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class IncreaseCharacterLimits1727998351561 {
	name = 'IncreaseCharacterLimits1727998351561'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "drive_file" ALTER COLUMN "comment" TYPE varchar(100000)`);
		await queryRunner.query(`ALTER TABLE "note" ALTER COLUMN "cw" TYPE text`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note" ALTER COLUMN "cw" TYPE varchar(512)`);
		await queryRunner.query(`ALTER TABLE "drive_file" ALTER COLUMN "comment" TYPE varchar(8192)`);
	}
}
