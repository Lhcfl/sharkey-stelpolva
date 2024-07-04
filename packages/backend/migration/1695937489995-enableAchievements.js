/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class EnableAchievements1695937489995 {
    name = 'EnableAchievements1695937489995'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "enableAchievements" boolean NOT NULL DEFAULT true`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableAchievements"`);
    }
}
