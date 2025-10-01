/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddNoteMandatoryCW1751077195277 {
	name = 'AddNoteMandatoryCW1751077195277'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note" ADD "mandatoryCW" text`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "mandatoryCW"`);
	}
}
