/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddMetaTranslationTimeout1747023091463 {
	name = 'AddMetaTranslationTimeout1747023091463'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "translationTimeout" integer NOT NULL DEFAULT '5000'`);
		await queryRunner.query(`COMMENT ON COLUMN "meta"."translationTimeout" IS 'Timeout in milliseconds for translation API requests'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`COMMENT ON COLUMN "meta"."translationTimeout" IS 'Timeout in milliseconds for translation API requests'`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "translationTimeout"`);
	}
}
