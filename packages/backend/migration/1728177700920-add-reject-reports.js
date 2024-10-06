/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddRejectReports1728177700920 {
    name = 'AddRejectReports1728177700920'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "instance" ADD "rejectReports" boolean NOT NULL DEFAULT false`);
		}

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "instance" DROP COLUMN "rejectReports"`);
		}
}
