/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddInstanceMandatoryCW1751078046239 {
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "instance" ADD "mandatoryCW" text`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "instance" DROP COLUMN "mandatoryCW"`);
	}
}
