/*
 * SPDX-FileCopyrightText: наб and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AnnouncementForRoles1752352800438 {
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "announcement" ADD "forRoles" text[] DEFAULT '{}'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "announcement" DROP COLUMN "forRoles"`);
	}
}
