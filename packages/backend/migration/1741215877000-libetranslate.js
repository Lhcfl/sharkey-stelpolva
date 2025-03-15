/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class Libetranslate1741215877000 {
    name = 'Libretranslate1741215877000';

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "libreTranslateURL" character varying(1024)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "libreTranslateKey" character varying(1024)`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "libreTranslateURL"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "libreTranslateKey"`);
    }
}
