/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class NSFWInstance1701809447000 {
    name = 'NSFWInstance1701809447000'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "instance" ADD "isNSFW" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "instance" DROP COLUMN "isNSFW"`);
    }
}
