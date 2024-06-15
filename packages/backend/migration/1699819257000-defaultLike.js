/*
 * SPDX-FileCopyrightText: marie and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class instanceDefaultLike1699819257000 {
    name = 'instanceDefaultLike1699819257000'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "defaultLike" character varying(500) DEFAULT '❤️'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "defaultLike"`);
    }
}
