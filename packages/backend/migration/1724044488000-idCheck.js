/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class idCheck1724044488000 {
    name = 'idCheck1724044488000';

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" ADD "idCheckRequired" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "user" ADD "idVerified" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "user" ADD "idSession" character varying(1024) NULL`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "idCheckRequired"`);
		await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "idVerified"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "idSession"`);
    }
}
