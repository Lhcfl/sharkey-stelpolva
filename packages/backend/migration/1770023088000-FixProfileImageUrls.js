/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
export class FixProfileImageUrls1770023088000 {
    name = 'FixProfileImageUrls1770023088000'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "avatarUrl" TYPE character varying(1024)`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "bannerUrl" TYPE character varying(1024)`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "backgroundUrl" TYPE character varying(1024)`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "avatarUrl" TYPE character varying(512)`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "bannerUrl" TYPE character varying(512)`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "backgroundUrl" TYPE character varying(512)`);
    }
}
