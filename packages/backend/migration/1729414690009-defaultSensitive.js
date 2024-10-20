/*
 * SPDX-FileCopyrightText: marie and sharkey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class DefaultSensitive1729414690009 {
    name = 'DefaultSensitive1729414690009'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "defaultSensitive" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "defaultSensitive"`);
    }
}
