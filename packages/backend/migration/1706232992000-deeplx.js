/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class Deeplx1706232992000 {
    name = 'Deeplx1706232992000';

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "deeplFreeMode" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "deeplFreeInstance" character varying(1024)`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "deeplFreeMode"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "deeplFreeInstance"`);
    }
}
