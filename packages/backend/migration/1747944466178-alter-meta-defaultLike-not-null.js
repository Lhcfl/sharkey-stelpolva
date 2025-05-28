/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AlterMetaDefaultLikeNotNull1747944466178 {
    name = 'AlterMetaDefaultLikeNotNull1747944466178'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "defaultLike" SET NOT NULL`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "defaultLike" DROP NOT NULL`);
    }
}
