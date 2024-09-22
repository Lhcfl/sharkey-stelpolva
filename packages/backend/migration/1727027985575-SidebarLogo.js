/*
 * SPDX-FileCopyrightText: piuvas and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class SidebarLogo1727027985575 {
    name = 'SidebarLogo1727027985575';

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "sidebarLogoUrl" character varying(1024)`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "sidebarLogoUrl"`);
    }
}
