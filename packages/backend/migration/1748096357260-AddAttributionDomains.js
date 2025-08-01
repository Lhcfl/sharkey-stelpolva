/*
 * SPDX-FileCopyrightText: piuvas and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddAttributionDomains1748096357260 {
    name = 'AddAttributionDomains1748096357260'

    async up(queryRunner) {
    		await queryRunner.query(`ALTER TABLE "user" ADD "attributionDomains" text array NOT NULL DEFAULT '{}'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "attributionDomains"`);
    }
}
