/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class idCheck1724044488000 {
    name = 'idCheck1724044488000';

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" ADD "idCheckRequired" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "user" ADD "idVerified" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "idCheckRequired"`);
		await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "idVerified"`);
    }
}
