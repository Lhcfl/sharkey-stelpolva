/*
 * SPDX-FileCopyrightText: наб and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class UserPendingIp1752377661219 {
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_pending" ADD "requestOriginIp" varchar(128)`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_pending" DROP COLUMN "requestOriginIp"`);
	}
}
